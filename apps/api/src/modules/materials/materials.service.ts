import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toPaginatedResponse } from "../../common/pagination";
import { IN_PROGRESS_STATUSES } from "../trips/domain/trip-state-machine";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { MaterialQueryDto } from "./dto/material-query.dto";
import type { CreateMaterialDto } from "./dto/create-material.dto";
import type { UpdateMaterialDto } from "./dto/update-material.dto";

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateMaterialDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.material.findFirst({ where: { tenantId, code: dto.code } });
    if (existing) {
      throw new ConflictException({ code: "MATERIAL_CODE_TAKEN", message: "Ya existe un material con ese codigo." });
    }

    const material = await this.prisma.material.create({ data: { tenantId, ...dto } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "MATERIAL_CREATED",
      entityType: "Material",
      entityId: material.id,
      newValue: dto,
    });

    return material;
  }

  // Para el selector de material al crear un viaje: en vez de mostrar TODOS
  // los materiales del tenant (facil de confundirse entre variantes), esto
  // trae los que mas se usan de verdad (segun cuantas tarifas los
  // referencian) — si el tenant tiene pocos materiales configurados, se
  // completa con el resto en orden alfabetico hasta llegar a `limit`.
  async findMostUsed(tenantId: string, limit: number) {
    const grouped = await this.prisma.rate.groupBy({
      by: ["materialId"],
      where: { tenantId, deletedAt: null },
      _count: { materialId: true },
      orderBy: { _count: { materialId: "desc" } },
      take: limit,
    });
    const topIds = grouped.map((g) => g.materialId);
    const topMaterials = topIds.length
      ? await this.prisma.material.findMany({ where: { id: { in: topIds }, tenantId, status: "ACTIVE" } })
      : [];
    const orderedTop = topIds
      .map((id) => topMaterials.find((m) => m.id === id))
      .filter((m): m is (typeof topMaterials)[number] => !!m);

    if (orderedTop.length >= limit) return orderedTop;

    const filler = await this.prisma.material.findMany({
      where: { tenantId, status: "ACTIVE", id: { notIn: orderedTop.map((m) => m.id) } },
      orderBy: { name: "asc" },
      take: limit - orderedTop.length,
    });
    return [...orderedTop, ...filler];
  }

  async findAll(tenantId: string, query: MaterialQueryDto) {
    const where = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: "insensitive" as const } }, { code: { contains: query.search, mode: "insensitive" as const } }] }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.material.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.material.count({ where }),
    ]);

    return toPaginatedResponse(items, query.page, query.pageSize, totalItems);
  }

  async findById(tenantId: string, id: string) {
    const material = await this.prisma.material.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!material) {
      throw new NotFoundException({ code: "MATERIAL_NOT_FOUND", message: "Material no encontrado." });
    }
    return material;
  }

  async update(tenantId: string, id: string, dto: UpdateMaterialDto, actor: AuthenticatedUser) {
    const material = await this.findById(tenantId, id);
    const updated = await this.prisma.material.update({ where: { id: material.id }, data: dto });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "MATERIAL_UPDATED",
      entityType: "Material",
      entityId: material.id,
      oldValue: material,
      newValue: dto,
    });

    return updated;
  }

  async updateStatus(tenantId: string, id: string, status: "ACTIVE" | "INACTIVE", actor: AuthenticatedUser) {
    const material = await this.findById(tenantId, id);
    const updated = await this.prisma.material.update({ where: { id: material.id }, data: { status } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "MATERIAL_STATUS_CHANGED",
      entityType: "Material",
      entityId: material.id,
      oldValue: { status: material.status },
      newValue: { status: updated.status },
    });

    return updated;
  }

  // Soft-delete: nunca se borra la fila (el material puede estar referenciado
  // por tarifas/viajes historicos via FK), queda excluida de las consultas
  // normales (deletedAt: null). Bloqueado si tiene viajes en curso.
  async remove(tenantId: string, id: string, reason: string | undefined, actor: AuthenticatedUser) {
    const material = await this.findById(tenantId, id);

    const activeTrips = await this.prisma.trip.count({
      where: { materialId: id, status: { in: IN_PROGRESS_STATUSES } },
    });
    if (activeTrips > 0) {
      throw new ConflictException({
        code: "MATERIAL_HAS_ACTIVE_TRIPS",
        message: "No se puede eliminar un material con viajes en curso.",
      });
    }

    const updated = await this.prisma.material.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.sub, deleteReason: reason, status: "INACTIVE" },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "MATERIAL_DELETED",
      entityType: "Material",
      entityId: id,
      reason,
      oldValue: { name: material.name, code: material.code },
    });

    return updated;
  }
}
