import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RolesService } from "../roles/roles.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { CreateTenantDto } from "./dto/create-tenant.dto";

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateTenantDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.tenant.findFirst({ where: { taxId: dto.taxId } });
    if (existing) {
      throw new ConflictException({ code: "TENANT_TAX_ID_TAKEN", message: "Ya existe una empresa con ese NIT." });
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        legalName: dto.legalName,
        taxId: dto.taxId,
        logoUrl: dto.logoUrl,
      },
    });

    await this.rolesService.provisionDefaultRoles(tenant.id);

    await this.auditService.record({
      tenantId: tenant.id,
      actorUserId: actor.kind === "user" ? actor.sub : null,
      action: "TENANT_CREATED",
      entityType: "Tenant",
      entityId: tenant.id,
      newValue: { name: tenant.name, taxId: tenant.taxId },
    });

    return tenant;
  }

  async findAll() {
    return this.prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException({ code: "TENANT_NOT_FOUND", message: "Empresa no encontrada." });
    }
    return tenant;
  }

  async updateStatus(id: string, status: TenantStatus, actor: AuthenticatedUser) {
    const tenant = await this.findById(id);

    const updated = await this.prisma.tenant.update({ where: { id }, data: { status } });

    await this.auditService.record({
      tenantId: tenant.id,
      actorUserId: actor.kind === "user" ? actor.sub : null,
      action: "TENANT_STATUS_CHANGED",
      entityType: "Tenant",
      entityId: tenant.id,
      oldValue: { status: tenant.status },
      newValue: { status: updated.status },
    });

    return updated;
  }
}
