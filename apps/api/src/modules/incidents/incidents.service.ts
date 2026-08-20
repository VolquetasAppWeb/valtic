import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "../../common/storage/storage.service";
import { TripsService } from "../trips/trips.service";
import { toPaginatedResponse } from "../../common/pagination";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { CreateIncidentDto } from "./dto/create-incident.dto";
import type { ResolveIncidentDto } from "./dto/resolve-incident.dto";
import type { IncidentQueryDto } from "./dto/incident-query.dto";

const DETAIL_INCLUDE = {
  driver: { select: { id: true, firstName: true, lastName: true, documentNumber: true } },
  vehicle: { select: { id: true, plate: true } },
  trip: { select: { id: true, sequentialNumber: true, status: true } },
  resolvedBy: { select: { id: true, firstName: true, lastName: true } },
  evidences: true,
} satisfies Prisma.IncidentInclude;

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly tripsService: TripsService,
  ) {}

  async create(tenantId: string, dto: CreateIncidentDto, actor: AuthenticatedUser) {
    const driverId = actor.kind === "driver" ? actor.sub : dto.driverId;
    if (!driverId) {
      throw new BadRequestException({ code: "DRIVER_REQUIRED", message: "Debes indicar el conductor de la novedad." });
    }

    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, tenantId } });
    if (!driver) {
      throw new NotFoundException({ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." });
    }
    if (actor.kind === "user" && isDispatcherScoped(actor) && driver.dispatcherId !== actor.sub) {
      throw new NotFoundException({ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." });
    }

    if (dto.tripId) {
      const trip = await this.prisma.trip.findFirst({ where: { id: dto.tripId, tenantId } });
      if (!trip) {
        throw new NotFoundException({ code: "TRIP_NOT_FOUND", message: "Viaje no encontrado." });
      }
    }
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, tenantId } });
      if (!vehicle) {
        throw new NotFoundException({ code: "VEHICLE_NOT_FOUND", message: "Vehiculo no encontrado." });
      }
    }

    const incident = await this.prisma.incident.create({
      data: {
        tenantId,
        driverId,
        tripId: dto.tripId,
        vehicleId: dto.vehicleId,
        type: dto.type,
        severity: dto.severity,
        description: dto.description,
        latitude: dto.latitude,
        longitude: dto.longitude,
        status: "OPEN",
      },
      include: DETAIL_INCLUDE,
    });

    if (dto.severity === "CRITICAL" && dto.tripId) {
      await this.tripsService.blockByIncident(tenantId, dto.tripId, incident.id, actor);
    }

    await this.auditService.record({
      tenantId,
      actorUserId: actor.kind === "user" ? actor.sub : null,
      action: "INCIDENT_REPORTED",
      entityType: "Incident",
      entityId: incident.id,
      newValue: { type: incident.type, severity: incident.severity, tripId: dto.tripId },
    });

    return incident;
  }

  async findAll(tenantId: string, query: IncidentQueryDto, actor: AuthenticatedUser) {
    const where: Prisma.IncidentWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(isDispatcherScoped(actor) ? { driver: { dispatcherId: actor.sub } } : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        orderBy: { reportedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: DETAIL_INCLUDE,
      }),
      this.prisma.incident.count({ where }),
    ]);

    return toPaginatedResponse(items, query.page, query.pageSize, totalItems);
  }

  async countOpen(tenantId: string, actor: AuthenticatedUser): Promise<number> {
    return this.prisma.incident.count({
      where: {
        tenantId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        ...(isDispatcherScoped(actor) ? { driver: { dispatcherId: actor.sub } } : {}),
      },
    });
  }

  async findById(tenantId: string, id: string, restrictToDriverId?: string, actor?: AuthenticatedUser) {
    const incident = await this.prisma.incident.findFirst({
      where: {
        id,
        tenantId,
        ...(restrictToDriverId ? { driverId: restrictToDriverId } : {}),
        ...(actor && isDispatcherScoped(actor) ? { driver: { dispatcherId: actor.sub } } : {}),
      },
      include: DETAIL_INCLUDE,
    });
    if (!incident) {
      throw new NotFoundException({ code: "INCIDENT_NOT_FOUND", message: "Novedad no encontrada." });
    }
    return incident;
  }

  // El DISPATCHER solo puede resolver novedades de sus propios conductores;
  // TENANT_ADMIN resuelve cualquiera del tenant. El scope se aplica en el
  // mismo findById (lanza INCIDENT_NOT_FOUND si la novedad es de otro
  // dispatcher, en vez de un 403 que confirmaria su existencia).
  async resolve(tenantId: string, id: string, dto: ResolveIncidentDto, actor: AuthenticatedUser) {
    const incident = await this.findById(tenantId, id, undefined, actor);

    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNotes: dto.resolutionNotes,
        ...(dto.status === "RESOLVED" || dto.status === "DISMISSED"
          ? { resolvedAt: new Date(), resolvedById: actor.kind === "user" ? actor.sub : null }
          : {}),
      },
      include: DETAIL_INCLUDE,
    });

    if ((dto.status === "RESOLVED" || dto.status === "DISMISSED") && incident.tripId) {
      await this.tripsService.unblockFromIncident(tenantId, incident.tripId, incident.id, actor);
    }

    await this.auditService.record({
      tenantId,
      actorUserId: actor.kind === "user" ? actor.sub : null,
      action: "INCIDENT_STATUS_CHANGED",
      entityType: "Incident",
      entityId: id,
      reason: dto.resolutionNotes,
      oldValue: { status: incident.status },
      newValue: { status: dto.status },
    });

    return updated;
  }

  async addEvidence(tenantId: string, incidentId: string, file: Express.Multer.File, actor: AuthenticatedUser) {
    const incident = await this.findById(tenantId, incidentId, undefined, actor);
    const stored = await this.storageService.save(file, `incidents/${incidentId}`);

    const evidence = await this.prisma.evidence.create({
      data: {
        tenantId,
        incidentId: incident.id,
        tripId: incident.tripId,
        type: file.mimetype.startsWith("image/") ? "PHOTO" : file.mimetype === "application/pdf" ? "DOCUMENT" : "OTHER",
        fileUrl: stored.fileUrl,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        fileSize: stored.fileSize,
        uploadedById: actor.kind === "user" ? actor.sub : null,
        uploadedByDriverId: actor.kind === "driver" ? actor.sub : null,
      },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.kind === "user" ? actor.sub : null,
      actorDriverId: actor.kind === "driver" ? actor.sub : null,
      action: "INCIDENT_EVIDENCE_UPLOADED",
      entityType: "Incident",
      entityId: incident.id,
      newValue: { fileName: evidence.fileName, type: evidence.type },
    });

    return evidence;
  }
}
