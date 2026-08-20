import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, Rate, TripStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { TripEventsService } from "../trip-events/trip-events.service";
import { StorageService } from "../../common/storage/storage.service";
import { OcrService } from "../../common/ocr/ocr.service";
import { toPaginatedResponse } from "../../common/pagination";
import { assertValidTransition, isTerminalStatus } from "./domain/trip-state-machine";
import { DRIVER_ACTION_SPEC, DRIVER_PROGRESS_ORDER, type DriverActionType } from "./domain/driver-actions";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { CreateTripDto } from "./dto/create-trip.dto";
import type { TripQueryDto } from "./dto/trip-query.dto";

export type DriverActionResult =
  | { status: "APPLIED"; trip: unknown }
  | { status: "ALREADY_APPLIED"; trip: unknown }
  | { status: "REQUIRES_REVIEW"; message: string };

const DETAIL_INCLUDE = {
  driver: { select: { id: true, firstName: true, lastName: true, documentNumber: true } },
  vehicle: { select: { id: true, plate: true, vehicleType: true, capacity: true, capacityUnit: true } },
  fleetOwner: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, code: true } },
  originSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true, geofenceRadius: true } },
  destinationSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true, geofenceRadius: true } },
  material: { select: { id: true, name: true, unit: true } },
} satisfies Prisma.TripInclude;

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly tripEventsService: TripEventsService,
    private readonly storageService: StorageService,
    private readonly ocrService: OcrService,
  ) {}

  async create(tenantId: string, dto: CreateTripDto, actor: AuthenticatedUser) {
    const [project, driver, vehicle, originSite, destinationSite, material] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: dto.projectId, tenantId } }),
      this.prisma.driver.findFirst({ where: { id: dto.driverId, tenantId } }),
      this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, tenantId } }),
      this.prisma.operationalSite.findFirst({ where: { id: dto.originSiteId, tenantId } }),
      this.prisma.operationalSite.findFirst({ where: { id: dto.destinationSiteId, tenantId } }),
      this.prisma.material.findFirst({ where: { id: dto.materialId, tenantId } }),
    ]);

    if (!project) throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Obra no encontrada." });
    if (!driver) throw new NotFoundException({ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." });
    if (driver.status !== "ACTIVE") {
      throw new NotFoundException({ code: "DRIVER_NOT_ACTIVE", message: "El conductor no esta activo." });
    }
    if (!vehicle) throw new NotFoundException({ code: "VEHICLE_NOT_FOUND", message: "Vehiculo no encontrado." });
    if (vehicle.status !== "ACTIVE") {
      throw new NotFoundException({ code: "VEHICLE_NOT_ACTIVE", message: "El vehiculo no esta activo." });
    }
    if (!originSite) throw new NotFoundException({ code: "SITE_NOT_FOUND", message: "Punto de cargue no encontrado." });
    if (!destinationSite) {
      throw new NotFoundException({ code: "SITE_NOT_FOUND", message: "Punto de descargue no encontrado." });
    }
    if (!material) throw new NotFoundException({ code: "MATERIAL_NOT_FOUND", message: "Material no encontrado." });

    if (isDispatcherScoped(actor)) {
      if (driver.dispatcherId !== actor.sub) {
        throw new NotFoundException({ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." });
      }
      if (vehicle.dispatcherId !== actor.sub) {
        throw new NotFoundException({ code: "VEHICLE_NOT_FOUND", message: "Vehiculo no encontrado." });
      }
      if (project.dispatcherId !== actor.sub) {
        throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Obra no encontrada." });
      }
    }

    const rate = await this.resolveApplicableRate(tenantId, {
      projectId: dto.projectId,
      originSiteId: dto.originSiteId,
      destinationSiteId: dto.destinationSiteId,
      materialId: dto.materialId,
      fleetOwnerId: vehicle.fleetOwnerId,
      vehicleType: vehicle.vehicleType,
    });

    if (!rate) {
      throw new NotFoundException({
        code: "TRIP_RATE_NOT_FOUND",
        message: "No hay una tarifa vigente configurada para esta ruta, material y propietario/tipo de vehiculo.",
      });
    }

    const trip = await this.prisma.$transaction(async (tx) => {
      const last = await tx.trip.findFirst({ where: { tenantId }, orderBy: { sequentialNumber: "desc" } });
      const sequentialNumber = (last?.sequentialNumber ?? 0) + 1;
      const now = new Date();

      const created = await tx.trip.create({
        data: {
          tenantId,
          sequentialNumber,
          projectId: dto.projectId,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          fleetOwnerId: vehicle.fleetOwnerId,
          originSiteId: dto.originSiteId,
          destinationSiteId: dto.destinationSiteId,
          materialId: dto.materialId,
          rateId: rate.id,
          rateSnapshot: this.buildRateSnapshot(rate),
          status: "ASSIGNED",
          estimatedQuantity: dto.estimatedQuantity,
          quantityUnit: dto.quantityUnit,
          assignedAt: now,
          createdById: actor.sub,
        },
        include: DETAIL_INCLUDE,
      });

      await this.tripEventsService.record(
        {
          tenantId,
          tripId: created.id,
          type: "CREATED",
          source: actor.kind === "user" ? "ADMIN" : "SYSTEM",
          actorUserId: actor.sub,
          payload: {
            driverId: dto.driverId,
            vehicleId: dto.vehicleId,
            projectId: dto.projectId,
            rateId: rate.id,
          },
          occurredAt: now,
        },
        tx,
      );

      return created;
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "TRIP_CREATED",
      entityType: "Trip",
      entityId: trip.id,
      newValue: { sequentialNumber: trip.sequentialNumber, driverId: dto.driverId, vehicleId: dto.vehicleId },
    });

    return trip;
  }

  async findAll(tenantId: string, query: TripQueryDto, actor: AuthenticatedUser) {
    const where: Prisma.TripWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status as TripStatus } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(isDispatcherScoped(actor) ? { driver: { dispatcherId: actor.sub } } : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: DETAIL_INCLUDE,
      }),
      this.prisma.trip.count({ where }),
    ]);

    return toPaginatedResponse(items, query.page, query.pageSize, totalItems);
  }

  async findActive(tenantId: string, actor: AuthenticatedUser) {
    return this.prisma.trip.findMany({
      where: {
        tenantId,
        status: { notIn: ["SETTLED", "CANCELLED", "MANUALLY_CLOSED", "REJECTED", "INCLUDED_IN_SETTLEMENT"] },
        ...(isDispatcherScoped(actor) ? { driver: { dispatcherId: actor.sub } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: DETAIL_INCLUDE,
    });
  }

  async findById(tenantId: string, id: string, restrictToDriverId?: string, actor?: AuthenticatedUser) {
    const trip = await this.prisma.trip.findFirst({
      where: {
        id,
        tenantId,
        ...(restrictToDriverId ? { driverId: restrictToDriverId } : {}),
        ...(actor && isDispatcherScoped(actor) ? { driver: { dispatcherId: actor.sub } } : {}),
      },
      include: { ...DETAIL_INCLUDE, events: { orderBy: { createdAt: "asc" } } },
    });
    if (!trip) {
      throw new NotFoundException({ code: "TRIP_NOT_FOUND", message: "Viaje no encontrado." });
    }
    return trip;
  }

  // Viajes recientes del conductor autenticado (permiso trips:read-own).
  async findMine(tenantId: string, driverId: string) {
    return this.prisma.trip.findMany({
      where: { tenantId, driverId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: DETAIL_INCLUDE,
    });
  }

  // Transiciones que dispara el propio conductor desde la app movil. Es
  // idempotente por diseno: el outbox offline puede reenviar la misma
  // accion varias veces (reconexion, reintentos) sin romper el estado.
  async applyDriverAction(
    tenantId: string,
    tripId: string,
    driverId: string,
    action: DriverActionType,
    deviceId: string | undefined,
    location: { latitude: number; longitude: number; accuracy: number } | undefined,
  ): Promise<DriverActionResult> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId } });
    if (!trip) {
      return { status: "REQUIRES_REVIEW", message: "Viaje no encontrado." };
    }
    if (trip.driverId !== driverId) {
      throw new ForbiddenException({ code: "TRIP_NOT_OWNED", message: "Este viaje no esta asignado a este conductor." });
    }

    const spec = DRIVER_ACTION_SPEC[action];
    const currentIndex = DRIVER_PROGRESS_ORDER.indexOf(trip.status);
    const targetIndex = DRIVER_PROGRESS_ORDER.indexOf(spec.targetStatus);

    if (currentIndex === -1 || targetIndex === -1) {
      return { status: "REQUIRES_REVIEW", message: `El viaje esta en estado ${trip.status} y no admite acciones de progreso.` };
    }
    if (trip.status === spec.targetStatus || currentIndex > targetIndex) {
      // Reenvio de una accion ya aplicada (outbox offline) -> no-op idempotente.
      return { status: "ALREADY_APPLIED", trip };
    }

    try {
      assertValidTransition(trip.status, spec.targetStatus);
    } catch {
      return {
        status: "REQUIRES_REVIEW",
        message: `El viaje no puede pasar de ${trip.status} a ${spec.targetStatus}.`,
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.trip.update({
        where: { id: trip.id, version: trip.version },
        data: {
          status: spec.targetStatus,
          version: { increment: 1 },
          ...(spec.timestampField ? { [spec.timestampField]: new Date() } : {}),
        },
        include: DETAIL_INCLUDE,
      });

      await this.tripEventsService.record(
        {
          tenantId,
          tripId: trip.id,
          type: spec.eventType,
          source: "DRIVER_APP",
          driverId,
          deviceId,
          latitude: location?.latitude,
          longitude: location?.longitude,
          accuracy: location?.accuracy,
          payload: { action },
        },
        tx,
      );

      return result;
    });

    await this.auditService.record({
      tenantId,
      actorDriverId: driverId,
      action: `TRIP_DRIVER_${action}`,
      entityType: "Trip",
      entityId: trip.id,
      oldValue: { status: trip.status },
      newValue: { status: updated.status, deviceId },
    });

    return { status: "APPLIED", trip: updated };
  }

  // Foto del vale fisico (recibo de entrega de material, opcional). Corre
  // OCR sobre la imagen para extraer cantidad/volumen y numero de vale --
  // queda guardado solo como referencia para que admin/dispatcher lo
  // comparen contra la cantidad registrada del viaje, nunca la reemplaza.
  // La foto tambien queda con la fecha/hora y GPS de cuando se tomo (no lo
  // que diga el papel), para poder verificar donde y cuando se capturo.
  async uploadVoucher(
    tenantId: string,
    tripId: string,
    file: Express.Multer.File,
    capture: { latitude?: number; longitude?: number; capturedAt?: string },
    actor: AuthenticatedUser,
  ) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId } });
    if (!trip) {
      throw new NotFoundException({ code: "TRIP_NOT_FOUND", message: "Viaje no encontrado." });
    }

    if (actor.kind === "driver" && trip.driverId !== actor.sub) {
      throw new ForbiddenException({ code: "TRIP_NOT_OWNED", message: "Este viaje no esta asignado a este conductor." });
    }
    if (actor.kind === "user" && isDispatcherScoped(actor)) {
      const driver = await this.prisma.driver.findFirst({ where: { id: trip.driverId, dispatcherId: actor.sub } });
      if (!driver) {
        throw new NotFoundException({ code: "TRIP_NOT_FOUND", message: "Viaje no encontrado." });
      }
    }

    const stored = await this.storageService.save(file, `trips/${tripId}/vouchers`);
    const rawText = await this.ocrService.extractText(file.buffer);
    const { quantity, unit, voucherNumber, fields } = this.ocrService.extractVoucherData(rawText);

    const [updated] = await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: tripId },
        data: {
          voucherImageUrl: stored.fileUrl,
          voucherRawText: rawText.slice(0, 5_000) || null,
          voucherNumber,
          voucherExtractedQuantity: quantity,
          voucherExtractedUnit: unit,
          voucherExtractedFields: Object.keys(fields).length > 0 ? fields : undefined,
          voucherLatitude: capture.latitude ?? null,
          voucherLongitude: capture.longitude ?? null,
          voucherCapturedAt: capture.capturedAt ? new Date(capture.capturedAt) : new Date(),
          voucherUploadedAt: new Date(),
        },
        include: DETAIL_INCLUDE,
      }),
      this.prisma.evidence.create({
        data: {
          tenantId,
          tripId,
          type: "PHOTO",
          fileUrl: stored.fileUrl,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
          uploadedById: actor.kind === "user" ? actor.sub : null,
          uploadedByDriverId: actor.kind === "driver" ? actor.sub : null,
        },
      }),
    ]);

    await this.auditService.record({
      tenantId,
      actorUserId: actor.kind === "user" ? actor.sub : null,
      actorDriverId: actor.kind === "driver" ? actor.sub : null,
      action: "TRIP_VOUCHER_UPLOADED",
      entityType: "Trip",
      entityId: tripId,
      newValue: { quantity, unit, voucherNumber, fields, latitude: capture.latitude, longitude: capture.longitude },
    });

    return updated;
  }

  async cancel(tenantId: string, id: string, reason: string, actor: AuthenticatedUser) {
    const trip = await this.getForTenant(tenantId, id, actor);
    assertValidTransition(trip.status, "CANCELLED");

    const updated = await this.applyTransition(tx => tx.trip.update({
      where: { id: trip.id, version: trip.version },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason, version: { increment: 1 } },
      include: DETAIL_INCLUDE,
    }), trip.id, tenantId, "CANCELLED", actor, { reason });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "TRIP_CANCELLED",
      entityType: "Trip",
      entityId: id,
      reason,
      oldValue: { status: trip.status },
      newValue: { status: "CANCELLED" },
    });

    return updated;
  }

  async manualClose(tenantId: string, id: string, reason: string, actor: AuthenticatedUser) {
    const trip = await this.getForTenant(tenantId, id, actor);
    assertValidTransition(trip.status, "MANUALLY_CLOSED");

    const updated = await this.applyTransition(tx => tx.trip.update({
      where: { id: trip.id, version: trip.version },
      data: { status: "MANUALLY_CLOSED", version: { increment: 1 } },
      include: DETAIL_INCLUDE,
    }), trip.id, tenantId, "MANUALLY_CLOSED", actor, { reason });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "TRIP_MANUALLY_CLOSED",
      entityType: "Trip",
      entityId: id,
      reason,
      oldValue: { status: trip.status },
      newValue: { status: "MANUALLY_CLOSED" },
    });

    return updated;
  }

  // Resultado de escanear un QR en el punto de descargue: siempre pasa
  // primero por PENDING_VALIDATION y de ahi resuelve a COMPLETED o
  // UNDER_REVIEW segun la geocerca. Nunca lo llama el driver directamente
  // (lo orquesta QrValidationService tras verificar firma/nonce/geocerca).
  async applyQrValidationResult(
    tenantId: string,
    tripId: string,
    driverId: string,
    result: {
      passed: boolean;
      reasons: string[];
      deviceId: string;
      latitude: number;
      longitude: number;
      accuracy: number;
      checkpointId: string;
    },
  ) {
    const trip = await this.getForTenant(tenantId, tripId);
    if (trip.driverId !== driverId) {
      throw new ForbiddenException({ code: "TRIP_NOT_OWNED", message: "Este viaje no esta asignado a este conductor." });
    }
    assertValidTransition(trip.status, "PENDING_VALIDATION");

    return this.prisma.$transaction(async (tx) => {
      let current = await tx.trip.update({
        where: { id: trip.id, version: trip.version },
        data: { status: "PENDING_VALIDATION", version: { increment: 1 } },
      });

      await this.tripEventsService.record(
        {
          tenantId,
          tripId,
          type: "QR_SCANNED",
          source: "QR_VALIDATION",
          driverId,
          deviceId: result.deviceId,
          latitude: result.latitude,
          longitude: result.longitude,
          accuracy: result.accuracy,
          payload: { checkpointId: result.checkpointId },
        },
        tx,
      );

      const targetStatus = result.passed ? "COMPLETED" : "UNDER_REVIEW";
      current = await tx.trip.update({
        where: { id: current.id, version: current.version },
        data: {
          status: targetStatus,
          version: { increment: 1 },
          ...(result.passed ? { completedAt: new Date() } : {}),
        },
        include: DETAIL_INCLUDE,
      });

      await this.tripEventsService.record(
        {
          tenantId,
          tripId,
          type: result.passed ? "VALIDATION_PASSED" : "VALIDATION_FAILED",
          source: "QR_VALIDATION",
          driverId,
          deviceId: result.deviceId,
          payload: { reasons: result.reasons },
        },
        tx,
      );

      if (result.passed) {
        await this.tripEventsService.record(
          { tenantId, tripId, type: "COMPLETED", source: "QR_VALIDATION", driverId, payload: {} },
          tx,
        );
      }

      return current;
    });
  }

  async review(tenantId: string, id: string, decision: "APPROVE" | "REJECT", notes: string | undefined, actor: AuthenticatedUser) {
    const trip = await this.getForTenant(tenantId, id, actor);
    const targetStatus = decision === "APPROVE" ? "COMPLETED" : "REJECTED";
    assertValidTransition(trip.status, targetStatus);

    const updated = await this.applyTransition(
      (tx) =>
        tx.trip.update({
          where: { id: trip.id, version: trip.version },
          data: {
            status: targetStatus,
            version: { increment: 1 },
            ...(targetStatus === "COMPLETED" ? { completedAt: new Date() } : {}),
          },
          include: DETAIL_INCLUDE,
        }),
      trip.id,
      tenantId,
      decision === "APPROVE" ? "REVIEWED_APPROVED" : "REVIEWED_REJECTED",
      actor,
      { notes },
    );

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: decision === "APPROVE" ? "TRIP_REVIEW_APPROVED" : "TRIP_REVIEW_REJECTED",
      entityType: "Trip",
      entityId: id,
      reason: notes,
      oldValue: { status: trip.status },
      newValue: { status: targetStatus },
    });

    return updated;
  }

  // BLOCKED_BY_INCIDENT es un desvio temporal, no una transicion mas de la
  // matriz: puede ocurrir desde casi cualquier estado activo, y siempre
  // vuelve al estado anterior (guardado en el propio TripEvent) al resolver
  // la novedad. Por eso no pasa por assertValidTransition.
  async blockByIncident(tenantId: string, tripId: string, incidentId: string, actor: AuthenticatedUser) {
    const trip = await this.getForTenant(tenantId, tripId, actor);
    if (isTerminalStatus(trip.status) || trip.status === "BLOCKED_BY_INCIDENT") {
      return trip;
    }

    const previousStatus = trip.status;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id: trip.id, version: trip.version },
        data: { status: "BLOCKED_BY_INCIDENT", version: { increment: 1 } },
        include: DETAIL_INCLUDE,
      });

      await this.tripEventsService.record(
        {
          tenantId,
          tripId,
          type: "INCIDENT_REPORTED",
          source: actor.kind === "user" ? "ADMIN" : "DRIVER_APP",
          actorUserId: actor.kind === "user" ? actor.sub : null,
          driverId: actor.kind === "driver" ? actor.sub : null,
          payload: { incidentId, previousStatus },
        },
        tx,
      );

      return updated;
    });
  }

  async unblockFromIncident(tenantId: string, tripId: string, incidentId: string, actor: AuthenticatedUser) {
    const trip = await this.getForTenant(tenantId, tripId, actor);
    if (trip.status !== "BLOCKED_BY_INCIDENT") {
      return trip;
    }

    const blockingEvent = await this.prisma.tripEvent.findFirst({
      where: { tenantId, tripId, type: "INCIDENT_REPORTED" },
      orderBy: { createdAt: "desc" },
    });
    const payload = blockingEvent?.payload as { incidentId?: string; previousStatus?: TripStatus } | null;
    const previousStatus: TripStatus = payload?.previousStatus ?? "ASSIGNED";

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id: trip.id, version: trip.version },
        data: { status: previousStatus, version: { increment: 1 } },
        include: DETAIL_INCLUDE,
      });

      await this.tripEventsService.record(
        {
          tenantId,
          tripId,
          type: "INCIDENT_RESOLVED",
          source: actor.kind === "user" ? "ADMIN" : "DRIVER_APP",
          actorUserId: actor.kind === "user" ? actor.sub : null,
          driverId: actor.kind === "driver" ? actor.sub : null,
          payload: { incidentId, restoredStatus: previousStatus },
        },
        tx,
      );

      return updated;
    });
  }

  // Viajes elegibles para una liquidacion: COMPLETED ya excluye por
  // construccion los cancelados, en revision, o ya incluidos en otra
  // liquidacion (esos ultimos pasaron a INCLUDED_IN_SETTLEMENT y dejaron
  // de ser COMPLETED). No hace falta un filtro adicional de exclusion.
  async findEligibleForSettlement(tenantId: string, fleetOwnerId: string, periodStart: Date, periodEnd: Date) {
    return this.prisma.trip.findMany({
      where: {
        tenantId,
        fleetOwnerId,
        status: "COMPLETED",
        completedAt: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { completedAt: "asc" },
      include: DETAIL_INCLUDE,
    });
  }

  async includeInSettlement(tenantId: string, tripId: string, settlementId: string, actor: AuthenticatedUser, tx: Prisma.TransactionClient) {
    const trip = await tx.trip.findFirstOrThrow({ where: { id: tripId, tenantId } });
    assertValidTransition(trip.status, "INCLUDED_IN_SETTLEMENT");

    await tx.trip.update({
      where: { id: trip.id, version: trip.version },
      data: { status: "INCLUDED_IN_SETTLEMENT", version: { increment: 1 } },
    });

    await this.tripEventsService.record(
      {
        tenantId,
        tripId,
        type: "INCLUDED_IN_SETTLEMENT",
        source: "ADMIN",
        actorUserId: actor.sub,
        payload: { settlementId },
      },
      tx,
    );
  }

  async markSettled(tenantId: string, tripId: string, settlementId: string, actor: AuthenticatedUser, tx: Prisma.TransactionClient) {
    const trip = await tx.trip.findFirstOrThrow({ where: { id: tripId, tenantId } });
    assertValidTransition(trip.status, "SETTLED");

    await tx.trip.update({
      where: { id: trip.id, version: trip.version },
      data: { status: "SETTLED", version: { increment: 1 } },
    });

    await this.tripEventsService.record(
      { tenantId, tripId, type: "SETTLED", source: "ADMIN", actorUserId: actor.sub, payload: { settlementId } },
      tx,
    );
  }

  // Cancelar un borrador de liquidacion devuelve sus viajes a COMPLETED. Es
  // un evento de correccion (COMPENSATION), no parte del flujo normal.
  async revertFromSettlement(tenantId: string, tripId: string, settlementId: string, actor: AuthenticatedUser, tx: Prisma.TransactionClient) {
    const trip = await tx.trip.findFirstOrThrow({ where: { id: tripId, tenantId } });
    if (trip.status !== "INCLUDED_IN_SETTLEMENT") return;

    await tx.trip.update({
      where: { id: trip.id, version: trip.version },
      data: { status: "COMPLETED", version: { increment: 1 } },
    });

    await this.tripEventsService.record(
      {
        tenantId,
        tripId,
        type: "COMPENSATION",
        source: "ADMIN",
        actorUserId: actor.sub,
        payload: { reason: "SETTLEMENT_CANCELLED", settlementId },
      },
      tx,
    );
  }

  private async getForTenant(tenantId: string, id: string, actor?: AuthenticatedUser) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, tenantId, ...(actor && isDispatcherScoped(actor) ? { driver: { dispatcherId: actor.sub } } : {}) },
    });
    if (!trip) {
      throw new NotFoundException({ code: "TRIP_NOT_FOUND", message: "Viaje no encontrado." });
    }
    return trip;
  }

  private async applyTransition<T>(
    updateFn: (tx: Prisma.TransactionClient) => Promise<T>,
    tripId: string,
    tenantId: string,
    eventType: "CANCELLED" | "MANUALLY_CLOSED" | "REVIEWED_APPROVED" | "REVIEWED_REJECTED",
    actor: AuthenticatedUser,
    payload: Record<string, unknown>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await updateFn(tx);
      await this.tripEventsService.record(
        {
          tenantId,
          tripId,
          type: eventType,
          source: actor.kind === "user" ? "ADMIN" : "DRIVER_APP",
          actorUserId: actor.kind === "user" ? actor.sub : null,
          driverId: actor.kind === "driver" ? actor.sub : null,
          payload,
        },
        tx,
      );
      return updated;
    });
  }

  private async resolveApplicableRate(
    tenantId: string,
    criteria: {
      projectId: string;
      originSiteId: string;
      destinationSiteId: string;
      materialId: string;
      fleetOwnerId: string;
      vehicleType: string;
    },
  ): Promise<Rate | null> {
    const now = new Date();
    const baseWhere = {
      tenantId,
      projectId: criteria.projectId,
      originSiteId: criteria.originSiteId,
      destinationSiteId: criteria.destinationSiteId,
      materialId: criteria.materialId,
      status: "ACTIVE" as const,
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
    };

    const byFleetOwner = await this.prisma.rate.findFirst({
      where: { ...baseWhere, fleetOwnerId: criteria.fleetOwnerId },
      orderBy: { validFrom: "desc" },
    });
    if (byFleetOwner) return byFleetOwner;

    const byVehicleType = await this.prisma.rate.findFirst({
      where: { ...baseWhere, fleetOwnerId: null, vehicleType: criteria.vehicleType as never },
      orderBy: { validFrom: "desc" },
    });
    if (byVehicleType) return byVehicleType;

    return this.prisma.rate.findFirst({
      where: { ...baseWhere, fleetOwnerId: null, vehicleType: null },
      orderBy: { validFrom: "desc" },
    });
  }

  private buildRateSnapshot(rate: Rate): Prisma.InputJsonValue {
    return {
      rateId: rate.id,
      rateType: rate.rateType,
      value: rate.value.toString(),
      currency: rate.currency,
      validFrom: rate.validFrom.toISOString(),
      validUntil: rate.validUntil?.toISOString() ?? null,
    };
  }
}
