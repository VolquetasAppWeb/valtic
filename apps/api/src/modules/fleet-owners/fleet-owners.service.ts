import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toPaginatedResponse } from "../../common/pagination";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import { IN_PROGRESS_STATUSES } from "../trips/domain/trip-state-machine";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import type { FleetOwnerQueryDto } from "./dto/fleet-owner-query.dto";
import type { CreateFleetOwnerDto } from "./dto/create-fleet-owner.dto";
import type { UpdateFleetOwnerDto } from "./dto/update-fleet-owner.dto";

@Injectable()
export class FleetOwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateFleetOwnerDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.fleetOwner.findFirst({ where: { tenantId, documentNumber: dto.documentNumber } });
    if (existing) {
      throw new ConflictException({ code: "FLEET_OWNER_DOCUMENT_TAKEN", message: "Ya existe un propietario con ese documento." });
    }

    const fleetOwner = await this.prisma.fleetOwner.create({
      data: { tenantId, ...dto, dispatcherId: isDispatcherScoped(actor) ? actor.sub : (dto.dispatcherId ?? null) },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "FLEET_OWNER_CREATED",
      entityType: "FleetOwner",
      entityId: fleetOwner.id,
      newValue: { name: fleetOwner.name, documentNumber: fleetOwner.documentNumber },
    });

    return fleetOwner;
  }

  async findAll(tenantId: string, query: FleetOwnerQueryDto, actor: AuthenticatedUser) {
    const where = {
      tenantId,
      deletedAt: null,
      ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { documentNumber: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.fleetOwner.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { vehicles: true } }, dispatcher: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.fleetOwner.count({ where }),
    ]);

    return toPaginatedResponse(items, query.page, query.pageSize, totalItems);
  }

  async findById(tenantId: string, id: string, actor: AuthenticatedUser) {
    const fleetOwner = await this.prisma.fleetOwner.findFirst({
      where: { id, tenantId, deletedAt: null, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
      include: { vehicles: true, dispatcher: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!fleetOwner) {
      throw new NotFoundException({ code: "FLEET_OWNER_NOT_FOUND", message: "Propietario no encontrado." });
    }
    return fleetOwner;
  }

  async update(tenantId: string, id: string, dto: UpdateFleetOwnerDto, actor: AuthenticatedUser) {
    const fleetOwner = await this.findById(tenantId, id, actor);
    const updated = await this.prisma.fleetOwner.update({ where: { id: fleetOwner.id }, data: dto });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "FLEET_OWNER_UPDATED",
      entityType: "FleetOwner",
      entityId: fleetOwner.id,
      newValue: dto,
    });

    return updated;
  }

  // Cada DISPATCHER tiene su propio "propietario" (para que pueda registrar
  // vehiculos sin depender de que el admin le asigne uno a mano); vinculado
  // 1:1 via FleetOwner.userId. Se llama al crear el usuario DISPATCHER, y
  // ademas de forma perezosa al crear un vehiculo (respaldo para
  // despachadores creados antes de que existiera esta funcionalidad).
  async ensureSelfFleetOwner(tenantId: string, userId: string) {
    const existing = await this.prisma.fleetOwner.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.prisma.fleetOwner.create({
      data: {
        tenantId,
        userId: user.id,
        dispatcherId: user.id,
        type: "NATURAL_PERSON",
        documentNumber: `DISP-${user.id.slice(0, 8).toUpperCase()}`,
        name: `${user.firstName} ${user.lastName}`,
        phone: user.phone ?? "",
        status: "ACTIVE",
      },
    });
  }

  async updateStatus(tenantId: string, id: string, status: "ACTIVE" | "INACTIVE", actor: AuthenticatedUser) {
    const fleetOwner = await this.findById(tenantId, id, actor);
    const updated = await this.prisma.fleetOwner.update({ where: { id: fleetOwner.id }, data: { status } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "FLEET_OWNER_STATUS_CHANGED",
      entityType: "FleetOwner",
      entityId: fleetOwner.id,
      oldValue: { status: fleetOwner.status },
      newValue: { status: updated.status },
    });

    return updated;
  }

  // Soft-delete: nunca se borra la fila (queda referenciada por vehiculos,
  // viajes y liquidaciones historicas via FK) — queda excluida de las
  // consultas normales (deletedAt: null) y visible solo para TENANT_ADMIN
  // via findDeleted. Bloqueado si tiene viajes en curso.
  async remove(tenantId: string, id: string, reason: string | undefined, actor: AuthenticatedUser) {
    const fleetOwner = await this.findById(tenantId, id, actor);

    const activeTrips = await this.prisma.trip.count({
      where: { fleetOwnerId: id, status: { in: IN_PROGRESS_STATUSES } },
    });
    if (activeTrips > 0) {
      throw new ConflictException({
        code: "FLEET_OWNER_HAS_ACTIVE_TRIPS",
        message: "No se puede eliminar un propietario con viajes en curso.",
      });
    }

    await this.prisma.fleetOwner.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.sub, deleteReason: reason, status: "INACTIVE" },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "FLEET_OWNER_DELETED",
      entityType: "FleetOwner",
      entityId: id,
      reason,
      oldValue: { name: fleetOwner.name, documentNumber: fleetOwner.documentNumber },
    });
  }

  // Historial de eliminados — solo para TENANT_ADMIN (gateado en el
  // controller via audit:read), no scopeado por dispatcher.
  async findDeleted(tenantId: string, query: PaginationQueryDto) {
    const where = { tenantId, deletedAt: { not: null } };

    const [items, totalItems] = await Promise.all([
      this.prisma.fleetOwner.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          dispatcher: { select: { id: true, firstName: true, lastName: true } },
          deletedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.fleetOwner.count({ where }),
    ]);

    return toPaginatedResponse(items, query.page, query.pageSize, totalItems);
  }
}
