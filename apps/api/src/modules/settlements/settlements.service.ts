import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PERMISSIONS } from "@valtic/types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { TripsService } from "../trips/trips.service";
import { toPaginatedResponse } from "../../common/pagination";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import { calculateSettlementItem } from "./domain/settlement-calculator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { SettlementPeriodDto } from "./dto/settlement-period.dto";
import type { CreateAdjustmentDto } from "./dto/create-adjustment.dto";
import type { SettlementQueryDto } from "./dto/settlement-query.dto";

// Quien NO tiene settlements:manage solo puede ver lo suyo: un DISPATCHER ve
// las liquidaciones de los propietarios que tiene asignados
// (FleetOwner.dispatcherId); un FLEET_OWNER con login propio ve solo las de
// su propio registro (FleetOwner.userId). Sin ninguna de las dos relaciones
// disponibles, no ve nada (mejor que un error 500).
function settlementScopeWhere(actor: AuthenticatedUser): Prisma.SettlementWhereInput {
  if (actor.permissions.includes(PERMISSIONS.SETTLEMENTS_MANAGE)) {
    return {};
  }
  if (isDispatcherScoped(actor)) {
    return { fleetOwner: { dispatcherId: actor.sub } };
  }
  return { fleetOwner: { userId: actor.sub } };
}

const DETAIL_INCLUDE = {
  fleetOwner: { select: { id: true, name: true, documentNumber: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  items: {
    include: {
      trip: {
        select: {
          id: true,
          sequentialNumber: true,
          completedAt: true,
          project: { select: { name: true } },
          originSite: { select: { name: true } },
          destinationSite: { select: { name: true } },
          material: { select: { name: true } },
          vehicle: { select: { plate: true } },
        },
      },
    },
  },
  adjustments: { include: { createdBy: { select: { id: true, firstName: true, lastName: true } } } },
} satisfies Prisma.SettlementInclude;

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly tripsService: TripsService,
  ) {}

  async preview(tenantId: string, dto: SettlementPeriodDto, actor: AuthenticatedUser) {
    const fleetOwner = await this.prisma.fleetOwner.findFirst({
      where: { id: dto.fleetOwnerId, tenantId, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
    });
    if (!fleetOwner) {
      throw new NotFoundException({ code: "FLEET_OWNER_NOT_FOUND", message: "Propietario no encontrado." });
    }

    const trips = await this.tripsService.findEligibleForSettlement(
      tenantId,
      dto.fleetOwnerId,
      new Date(dto.periodStart),
      new Date(`${dto.periodEnd}T23:59:59.999Z`),
    );

    const items = trips.map((trip) =>
      calculateSettlementItem({
        id: trip.id,
        sequentialNumber: trip.sequentialNumber,
        actualQuantity: trip.actualQuantity,
        estimatedQuantity: trip.estimatedQuantity,
        rateSnapshot: trip.rateSnapshot,
        originSite: trip.originSite,
        destinationSite: trip.destinationSite,
      }),
    );

    const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;

    return {
      fleetOwner: { id: fleetOwner.id, name: fleetOwner.name },
      trips: trips.map((trip, index) => ({
        id: trip.id,
        sequentialNumber: trip.sequentialNumber,
        completedAt: trip.completedAt,
        project: trip.project.name,
        route: `${trip.originSite.name} → ${trip.destinationSite.name}`,
        material: trip.material.name,
        item: items[index],
      })),
      subtotal,
      tripCount: trips.length,
    };
  }

  async create(tenantId: string, dto: SettlementPeriodDto, actor: AuthenticatedUser) {
    const fleetOwner = await this.prisma.fleetOwner.findFirst({
      where: { id: dto.fleetOwnerId, tenantId, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
    });
    if (!fleetOwner) {
      throw new NotFoundException({ code: "FLEET_OWNER_NOT_FOUND", message: "Propietario no encontrado." });
    }

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(`${dto.periodEnd}T23:59:59.999Z`);
    const trips = await this.tripsService.findEligibleForSettlement(tenantId, dto.fleetOwnerId, periodStart, periodEnd);

    if (trips.length === 0) {
      throw new BadRequestException({
        code: "SETTLEMENT_NO_ELIGIBLE_TRIPS",
        message: "No hay viajes completados para este propietario en el periodo seleccionado.",
      });
    }

    const items = trips.map((trip) =>
      calculateSettlementItem({
        id: trip.id,
        sequentialNumber: trip.sequentialNumber,
        actualQuantity: trip.actualQuantity,
        estimatedQuantity: trip.estimatedQuantity,
        rateSnapshot: trip.rateSnapshot,
        originSite: trip.originSite,
        destinationSite: trip.destinationSite,
      }),
    );
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
    const currency = (trips[0]?.rateSnapshot as { currency?: string } | null)?.currency ?? "COP";

    const settlement = await this.prisma.$transaction(async (tx) => {
      const last = await tx.settlement.findFirst({ where: { tenantId }, orderBy: { sequentialNumber: "desc" } });
      const sequentialNumber = (last?.sequentialNumber ?? 0) + 1;

      const created = await tx.settlement.create({
        data: {
          tenantId,
          sequentialNumber,
          fleetOwnerId: dto.fleetOwnerId,
          periodStart,
          periodEnd,
          status: "DRAFT",
          subtotal,
          adjustmentsTotal: 0,
          total: subtotal,
          currency,
        },
      });

      for (const item of items) {
        try {
          await tx.settlementItem.create({
            data: {
              settlementId: created.id,
              tripId: item.tripId,
              rateType: item.rateType as never,
              quantity: item.quantity,
              unitValue: item.unitValue,
              total: item.total,
              rateSnapshot: item.rateSnapshot as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          // Restriccion unica en tripId: otro proceso concurrente ya incluyo
          // este viaje en otra liquidacion entre el preview y este momento.
          throw new ConflictException({
            code: "TRIP_ALREADY_SETTLED",
            message: `El viaje #${trips.find((t) => t.id === item.tripId)?.sequentialNumber} ya fue incluido en otra liquidacion.`,
            cause: error,
          });
        }

        await this.tripsService.includeInSettlement(tenantId, item.tripId, created.id, actor, tx);
      }

      return created;
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "SETTLEMENT_CREATED",
      entityType: "Settlement",
      entityId: settlement.id,
      newValue: { fleetOwnerId: dto.fleetOwnerId, tripCount: trips.length, subtotal },
    });

    return this.findById(tenantId, settlement.id, actor);
  }

  async findAll(tenantId: string, query: SettlementQueryDto, actor: AuthenticatedUser) {
    const where: Prisma.SettlementWhereInput = {
      tenantId,
      ...settlementScopeWhere(actor),
      ...(query.fleetOwnerId ? { fleetOwnerId: query.fleetOwnerId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { fleetOwner: { select: { id: true, name: true } } },
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return toPaginatedResponse(items, query.page, query.pageSize, totalItems);
  }

  async findById(tenantId: string, id: string, actor: AuthenticatedUser) {
    const settlement = await this.prisma.settlement.findFirst({
      where: { id, tenantId, ...settlementScopeWhere(actor) },
      include: DETAIL_INCLUDE,
    });
    if (!settlement) {
      throw new NotFoundException({ code: "SETTLEMENT_NOT_FOUND", message: "Liquidacion no encontrada." });
    }
    return settlement;
  }

  async addAdjustment(tenantId: string, id: string, dto: CreateAdjustmentDto, actor: AuthenticatedUser) {
    const settlement = await this.getDraftOrThrow(tenantId, id);

    const signedAmount = dto.type === "DEDUCTION" ? -Math.abs(dto.amount) : dto.amount;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.settlementAdjustment.create({
        data: {
          settlementId: id,
          type: dto.type,
          description: dto.description,
          amount: signedAmount,
          createdById: actor.sub,
        },
      });

      const adjustments = await tx.settlementAdjustment.findMany({ where: { settlementId: id } });
      const adjustmentsTotal = adjustments.reduce((sum, adj) => sum + Number(adj.amount), 0);
      const total = Number(settlement.subtotal) + adjustmentsTotal;

      return tx.settlement.update({
        where: { id },
        data: { adjustmentsTotal, total },
      });
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "SETTLEMENT_ADJUSTMENT_ADDED",
      entityType: "Settlement",
      entityId: id,
      newValue: { type: dto.type, amount: signedAmount, description: dto.description },
    });

    return this.findById(tenantId, updated.id, actor);
  }

  async approve(tenantId: string, id: string, actor: AuthenticatedUser) {
    const settlement = await this.getDraftOrThrow(tenantId, id);
    const items = await this.prisma.settlementItem.findMany({ where: { settlementId: id } });

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        await this.tripsService.markSettled(tenantId, item.tripId, id, actor, tx);
      }

      return tx.settlement.update({
        where: { id },
        data: { status: "APPROVED", approvedById: actor.sub, approvedAt: new Date() },
      });
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "SETTLEMENT_APPROVED",
      entityType: "Settlement",
      entityId: id,
      oldValue: { status: settlement.status },
      newValue: { status: "APPROVED", total: settlement.total.toString() },
    });

    return this.findById(tenantId, updated.id, actor);
  }

  async cancel(tenantId: string, id: string, actor: AuthenticatedUser) {
    const settlement = await this.getDraftOrThrow(tenantId, id);
    const items = await this.prisma.settlementItem.findMany({ where: { settlementId: id } });

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        await this.tripsService.revertFromSettlement(tenantId, item.tripId, id, actor, tx);
      }
      await tx.settlementItem.deleteMany({ where: { settlementId: id } });
      await tx.settlement.update({ where: { id }, data: { status: "CANCELLED" } });
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "SETTLEMENT_CANCELLED",
      entityType: "Settlement",
      entityId: id,
      oldValue: { status: settlement.status },
      newValue: { status: "CANCELLED" },
    });

    return this.findById(tenantId, id, actor);
  }

  async toExportData(tenantId: string, id: string, actor: AuthenticatedUser) {
    const settlement = await this.findById(tenantId, id, actor);
    return {
      sequentialNumber: settlement.sequentialNumber,
      fleetOwnerName: settlement.fleetOwner.name,
      periodStart: settlement.periodStart,
      periodEnd: settlement.periodEnd,
      status: settlement.status,
      subtotal: Number(settlement.subtotal),
      adjustmentsTotal: Number(settlement.adjustmentsTotal),
      total: Number(settlement.total),
      currency: settlement.currency,
      items: settlement.items.map((item) => ({
        tripSequentialNumber: item.trip.sequentialNumber,
        route: `${item.trip.originSite.name} -> ${item.trip.destinationSite.name}`,
        material: item.trip.material.name,
        rateType: item.rateType,
        quantity: Number(item.quantity),
        unitValue: Number(item.unitValue),
        total: Number(item.total),
      })),
      adjustments: settlement.adjustments.map((adjustment) => ({
        type: adjustment.type,
        description: adjustment.description,
        amount: Number(adjustment.amount),
      })),
    };
  }

  private async getDraftOrThrow(tenantId: string, id: string) {
    const settlement = await this.prisma.settlement.findFirst({ where: { id, tenantId } });
    if (!settlement) {
      throw new NotFoundException({ code: "SETTLEMENT_NOT_FOUND", message: "Liquidacion no encontrada." });
    }
    if (settlement.status !== "DRAFT") {
      throw new BadRequestException({
        code: "SETTLEMENT_NOT_DRAFT",
        message: "Solo se pueden modificar liquidaciones en borrador.",
      });
    }
    return settlement;
  }
}
