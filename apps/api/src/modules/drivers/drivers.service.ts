import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toPaginatedResponse } from "../../common/pagination";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import { IN_PROGRESS_STATUSES } from "../trips/domain/trip-state-machine";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import type { CreateDriverDto } from "./dto/create-driver.dto";
import type { UpdateDriverDto } from "./dto/update-driver.dto";
import type { DriverQueryDto } from "./dto/driver-query.dto";

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateDriverDto, actor: AuthenticatedUser) {
    const existingActive = await this.prisma.driver.findFirst({
      where: { tenantId, documentNumber: dto.documentNumber, deletedAt: null },
    });
    if (existingActive) {
      throw new ConflictException({ code: "DRIVER_DOCUMENT_TAKEN", message: "Ya existe un conductor con ese documento." });
    }

    // Si el documento pertenece a un conductor eliminado (p. ej. lo despidieron
    // y vuelve), se restaura esa misma fila en vez de crear una duplicada —
    // asi conserva su historial de viajes en lugar de perderlo.
    const existingDeleted = await this.prisma.driver.findFirst({
      where: { tenantId, documentNumber: dto.documentNumber, deletedAt: { not: null } },
    });

    const { pin, licenseExpiration, ...rest } = dto;
    const pinHash = await argon2.hash(pin);
    const data = {
      ...rest,
      licenseExpiration: new Date(licenseExpiration),
      pinHash,
      dispatcherId: isDispatcherScoped(actor) ? actor.sub : null,
      status: "ACTIVE" as const,
      deletedAt: null,
      deletedById: null,
      deleteReason: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    };

    const driver = existingDeleted
      ? await this.prisma.driver.update({ where: { id: existingDeleted.id }, data })
      : await this.prisma.driver.create({ data: { tenantId, ...data } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: existingDeleted ? "DRIVER_RESTORED" : "DRIVER_CREATED",
      entityType: "Driver",
      entityId: driver.id,
      newValue: { documentNumber: driver.documentNumber, firstName: driver.firstName, lastName: driver.lastName },
    });

    return this.toSafeDriver(driver);
  }

  async findAll(tenantId: string, query: DriverQueryDto, actor: AuthenticatedUser) {
    const where = {
      tenantId,
      deletedAt: null,
      ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" as const } },
              { lastName: { contains: query.search, mode: "insensitive" as const } },
              { documentNumber: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        orderBy: { firstName: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          assignments: { where: { active: true }, include: { vehicle: true }, take: 1 },
        },
      }),
      this.prisma.driver.count({ where }),
    ]);

    return toPaginatedResponse(
      items.map((driver) => this.toSafeDriver(driver)),
      query.page,
      query.pageSize,
      totalItems,
    );
  }

  async findById(tenantId: string, id: string, actor: AuthenticatedUser) {
    const driver = await this.prisma.driver.findFirst({
      where: { id, tenantId, deletedAt: null, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
      include: {
        assignments: { where: { active: true }, include: { vehicle: true } },
        trips: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!driver) {
      throw new NotFoundException({ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." });
    }
    return this.toSafeDriver(driver);
  }

  async update(tenantId: string, id: string, dto: UpdateDriverDto, actor: AuthenticatedUser) {
    await this.assertExists(tenantId, id, actor);

    const { licenseExpiration, ...rest } = dto;
    const driver = await this.prisma.driver.update({
      where: { id },
      data: { ...rest, ...(licenseExpiration ? { licenseExpiration: new Date(licenseExpiration) } : {}) },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_UPDATED",
      entityType: "Driver",
      entityId: id,
      newValue: dto,
    });

    return this.toSafeDriver(driver);
  }

  async updateStatus(tenantId: string, id: string, status: "ACTIVE" | "INACTIVE" | "SUSPENDED", actor: AuthenticatedUser) {
    const driver = await this.assertExists(tenantId, id, actor);
    const updated = await this.prisma.driver.update({ where: { id }, data: { status } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_STATUS_CHANGED",
      entityType: "Driver",
      entityId: id,
      oldValue: { status: driver.status },
      newValue: { status: updated.status },
    });

    return this.toSafeDriver(updated);
  }

  async resetPin(tenantId: string, id: string, newPin: string, actor: AuthenticatedUser) {
    await this.assertExists(tenantId, id, actor);
    const pinHash = await argon2.hash(newPin);

    const updated = await this.prisma.driver.update({
      where: { id },
      data: { pinHash, pinFailedAttempts: 0, pinLockedUntil: null },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_PIN_RESET",
      entityType: "Driver",
      entityId: id,
    });

    return this.toSafeDriver(updated);
  }

  // El DISPATCHER elimina (soft-delete) solo sus propios conductores; nunca
  // se borra la fila — queda excluida de las consultas normales
  // (deletedAt: null) y visible unicamente para TENANT_ADMIN via
  // findDeleted, ademas de quedar registrada en AuditEvent con el motivo.
  async remove(tenantId: string, id: string, reason: string | undefined, actor: AuthenticatedUser) {
    const driver = await this.assertExists(tenantId, id, actor);

    const activeTrips = await this.prisma.trip.count({
      where: { driverId: id, status: { in: IN_PROGRESS_STATUSES } },
    });
    if (activeTrips > 0) {
      throw new ConflictException({
        code: "DRIVER_HAS_ACTIVE_TRIPS",
        message: "No se puede eliminar un conductor con viajes en curso.",
      });
    }

    await this.prisma.driver.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.sub, deleteReason: reason, status: "INACTIVE" },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_DELETED",
      entityType: "Driver",
      entityId: id,
      reason,
      oldValue: {
        documentNumber: driver.documentNumber,
        firstName: driver.firstName,
        lastName: driver.lastName,
        phone: driver.phone,
        licenseNumber: driver.licenseNumber,
        status: driver.status,
      },
    });
  }

  // Historial de eliminados — solo para TENANT_ADMIN (gateado en el
  // controller via audit:read), no scopeado por dispatcher: el admin
  // necesita ver eliminaciones de todos los dispatchers del tenant.
  async findDeleted(tenantId: string, query: PaginationQueryDto) {
    const where = { tenantId, deletedAt: { not: null } };

    const [items, totalItems] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          dispatcher: { select: { id: true, firstName: true, lastName: true } },
          deletedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.driver.count({ where }),
    ]);

    return toPaginatedResponse(
      items.map((driver) => this.toSafeDriver(driver)),
      query.page,
      query.pageSize,
      totalItems,
    );
  }

  private async assertExists(tenantId: string, id: string, actor: AuthenticatedUser) {
    const driver = await this.prisma.driver.findFirst({
      where: { id, tenantId, deletedAt: null, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
    });
    if (!driver) {
      throw new NotFoundException({ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." });
    }
    return driver;
  }

  private toSafeDriver<T extends { pinHash: string }>(driver: T) {
    const { pinHash: _pinHash, ...safe } = driver;
    return safe;
  }
}
