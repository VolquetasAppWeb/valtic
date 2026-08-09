import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { CreateRateDto } from "./dto/create-rate.dto";

interface RateFilters {
  projectId?: string;
  materialId?: string;
  originSiteId?: string;
  destinationSiteId?: string;
}

@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateRateDto, actor: AuthenticatedUser) {
    await Promise.all([
      this.assertBelongsToTenant("project", tenantId, dto.projectId),
      this.assertBelongsToTenant("operationalSite", tenantId, dto.originSiteId),
      this.assertBelongsToTenant("operationalSite", tenantId, dto.destinationSiteId),
      this.assertBelongsToTenant("material", tenantId, dto.materialId),
      dto.fleetOwnerId ? this.assertBelongsToTenant("fleetOwner", tenantId, dto.fleetOwnerId) : Promise.resolve(),
    ]);

    const { validFrom, validUntil, ...rest } = dto;
    const rate = await this.prisma.rate.create({
      data: {
        tenantId,
        ...rest,
        validFrom: new Date(validFrom),
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "RATE_CREATED",
      entityType: "Rate",
      entityId: rate.id,
      newValue: { rateType: rate.rateType, value: rate.value.toString() },
    });

    return rate;
  }

  async findAll(tenantId: string, filters: RateFilters) {
    return this.prisma.rate.findMany({
      where: {
        tenantId,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.materialId ? { materialId: filters.materialId } : {}),
        ...(filters.originSiteId ? { originSiteId: filters.originSiteId } : {}),
        ...(filters.destinationSiteId ? { destinationSiteId: filters.destinationSiteId } : {}),
      },
      orderBy: { validFrom: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        originSite: { select: { id: true, name: true } },
        destinationSite: { select: { id: true, name: true } },
        material: { select: { id: true, name: true } },
        fleetOwner: { select: { id: true, name: true } },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const rate = await this.prisma.rate.findFirst({
      where: { id, tenantId },
      include: {
        project: { select: { id: true, name: true } },
        originSite: { select: { id: true, name: true } },
        destinationSite: { select: { id: true, name: true } },
        material: { select: { id: true, name: true } },
        fleetOwner: { select: { id: true, name: true } },
      },
    });
    if (!rate) {
      throw new NotFoundException({ code: "RATE_NOT_FOUND", message: "Tarifa no encontrada." });
    }
    return rate;
  }

  async updateStatus(tenantId: string, id: string, status: "ACTIVE" | "EXPIRED" | "INACTIVE", actor: AuthenticatedUser) {
    const rate = await this.prisma.rate.findFirst({ where: { id, tenantId } });
    if (!rate) {
      throw new NotFoundException({ code: "RATE_NOT_FOUND", message: "Tarifa no encontrada." });
    }

    const updated = await this.prisma.rate.update({ where: { id }, data: { status } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "RATE_STATUS_CHANGED",
      entityType: "Rate",
      entityId: id,
      oldValue: { status: rate.status },
      newValue: { status: updated.status },
    });

    return updated;
  }

  private async assertBelongsToTenant(
    model: "project" | "operationalSite" | "material" | "fleetOwner",
    tenantId: string,
    id: string,
  ) {
    const record = await (this.prisma[model] as { findFirst: (args: unknown) => Promise<unknown> }).findFirst({
      where: { id, tenantId },
    });
    if (!record) {
      throw new NotFoundException({ code: "RATE_REFERENCE_NOT_FOUND", message: `Referencia invalida: ${model}.` });
    }
  }
}
