import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import type { TenantRoleName } from "@valtic/types";
import { PrismaService } from "../../prisma/prisma.service";
import { RolesService } from "../roles/roles.service";
import { AuditService } from "../audit/audit.service";
import { FleetOwnersService } from "../fleet-owners/fleet-owners.service";
import { toPaginatedResponse } from "../../common/pagination";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import type { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly auditService: AuditService,
    private readonly fleetOwnersService: FleetOwnersService,
  ) {}

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const tenantId = this.requireTenantId(actor);

    const existing = await this.prisma.user.findFirst({ where: { tenantId, email: dto.email, deletedAt: null } });
    if (existing) {
      throw new ConflictException({ code: "USER_EMAIL_TAKEN", message: "Ya existe un usuario con ese correo en la empresa." });
    }

    const role = await this.rolesService.findTenantRoleByName(tenantId, dto.roleName as TenantRoleName);
    if (!role) {
      throw new NotFoundException({ code: "ROLE_NOT_FOUND", message: "El rol solicitado no existe para esta empresa." });
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        userRoles: { create: { roleId: role.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });

    if (dto.roleName === "DISPATCHER") {
      // Cada despachador es "propietario" de si mismo por defecto: puede
      // registrar vehiculos sin depender de que el admin le asigne un
      // propietario a mano; el admin lo ve reflejado de inmediato en Propietarios.
      await this.fleetOwnersService.ensureSelfFleetOwner(tenantId, user.id);
    }

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      newValue: { email: user.email, role: dto.roleName },
    });

    return this.toSafeUser(user);
  }

  async findAll(actor: AuthenticatedUser) {
    const tenantId = this.requireTenantId(actor);
    const users = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
    });
    return users.map((user) => this.toSafeUser(user));
  }

  async updateStatus(id: string, status: "ACTIVE" | "INACTIVE", actor: AuthenticatedUser) {
    const tenantId = this.requireTenantId(actor);
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Usuario no encontrado." });
    }

    const updated = await this.prisma.user.update({ where: { id }, data: { status } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "USER_STATUS_CHANGED",
      entityType: "User",
      entityId: id,
      oldValue: { status: user.status },
      newValue: { status: updated.status },
    });

    return this.toSafeUser(updated);
  }

  // Estadisticas de desempeno de un despachador para el panel de Usuarios:
  // viajes (via Driver.dispatcherId, mismo criterio de "scoping" que usa
  // ReportsService), volquetas y dinero liquidado (via FleetOwner.dispatcherId
  // — los propietarios que administra este despachador, incluyendo el
  // propietario "self" que se crea automaticamente al crear el usuario).
  async getDispatcherStats(id: string, actor: AuthenticatedUser) {
    const tenantId = this.requireTenantId(actor);
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Usuario no encontrado." });
    }
    const isDispatcher = user.userRoles.some((ur) => ur.role.name === "DISPATCHER");
    if (!isDispatcher) {
      throw new NotFoundException({
        code: "USER_NOT_DISPATCHER",
        message: "Las estadisticas solo aplican a usuarios con rol Despachador.",
      });
    }

    const completedStatuses = ["COMPLETED", "INCLUDED_IN_SETTLEMENT", "SETTLED", "MANUALLY_CLOSED"] as const;

    const [tripsTotal, tripsCompleted, vehiclesCount, paidAgg, pendingAgg] = await Promise.all([
      this.prisma.trip.count({ where: { tenantId, driver: { dispatcherId: id } } }),
      this.prisma.trip.count({
        where: { tenantId, driver: { dispatcherId: id }, status: { in: [...completedStatuses] } },
      }),
      this.prisma.vehicle.count({ where: { tenantId, fleetOwner: { dispatcherId: id } } }),
      this.prisma.settlement.aggregate({
        where: { tenantId, fleetOwner: { dispatcherId: id }, status: "PAID" },
        _sum: { total: true },
      }),
      this.prisma.settlement.aggregate({
        where: { tenantId, fleetOwner: { dispatcherId: id }, status: { in: ["DRAFT", "APPROVED"] } },
        _sum: { total: true },
      }),
    ]);

    return {
      tripsTotal,
      tripsCompleted,
      vehiclesCount,
      moneyPaid: paidAgg._sum.total ?? 0,
      moneyPendingSettlement: pendingAgg._sum.total ?? 0,
    };
  }

  // Soft-delete: nunca se borra la fila (queda referenciada por auditoria,
  // viajes creados, tarifas fijadas, etc via FK) — queda excluida de las
  // consultas normales (deletedAt: null) y visible solo para TENANT_ADMIN
  // via findDeleted. Bloqueado si es la propia cuenta o el ultimo admin
  // activo de la empresa (para no dejar el tenant sin nadie que administre).
  async remove(id: string, reason: string | undefined, actor: AuthenticatedUser) {
    const tenantId = this.requireTenantId(actor);
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Usuario no encontrado." });
    }
    if (id === actor.sub) {
      throw new ForbiddenException({ code: "CANNOT_DELETE_SELF", message: "No puedes eliminar tu propia cuenta." });
    }

    const isAdmin = user.userRoles.some((ur) => ur.role.name === "TENANT_ADMIN");
    if (isAdmin) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: {
          tenantId,
          deletedAt: null,
          status: "ACTIVE",
          id: { not: id },
          userRoles: { some: { role: { name: "TENANT_ADMIN" } } },
        },
      });
      if (otherActiveAdmins === 0) {
        throw new ConflictException({
          code: "LAST_ADMIN",
          message: "No se puede eliminar el ultimo administrador activo de la empresa.",
        });
      }
    }

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.sub, deleteReason: reason, status: "INACTIVE" },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "USER_DELETED",
      entityType: "User",
      entityId: id,
      reason,
      oldValue: { email: user.email, firstName: user.firstName, lastName: user.lastName },
    });
  }

  // Historial de eliminados — solo para TENANT_ADMIN (gateado en el
  // controller via audit:read).
  async findDeleted(tenantId: string, query: PaginationQueryDto) {
    const where = { tenantId, deletedAt: { not: null } };

    const [items, totalItems] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          userRoles: { include: { role: true } },
          deletedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return toPaginatedResponse(
      items.map((user) => this.toSafeUser(user)),
      query.page,
      query.pageSize,
      totalItems,
    );
  }

  private requireTenantId(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new NotFoundException({ code: "TENANT_SCOPE_REQUIRED", message: "Accion no disponible fuera de un tenant." });
    }
    return actor.tenantId;
  }

  private toSafeUser<T extends { passwordHash: string }>(user: T) {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}
