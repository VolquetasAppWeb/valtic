import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import type { TenantRoleName } from "@valtic/types";
import { PrismaService } from "../../prisma/prisma.service";
import { RolesService } from "../roles/roles.service";
import { AuditService } from "../audit/audit.service";
import { FleetOwnersService } from "../fleet-owners/fleet-owners.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
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

    const existing = await this.prisma.user.findFirst({ where: { tenantId, email: dto.email } });
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
      where: { tenantId },
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
