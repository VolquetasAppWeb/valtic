import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import { IN_PROGRESS_STATUSES } from "../trips/domain/trip-state-machine";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { CreateOperationalSiteDto } from "./dto/create-operational-site.dto";
import type { UpdateOperationalSiteDto } from "./dto/update-operational-site.dto";

@Injectable()
export class OperationalSitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateOperationalSiteDto, actor: AuthenticatedUser) {
    await this.assertProjectBelongsToTenant(tenantId, dto.projectId, actor);

    const site = await this.prisma.operationalSite.create({ data: { tenantId, ...dto } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "OPERATIONAL_SITE_CREATED",
      entityType: "OperationalSite",
      entityId: site.id,
      newValue: { name: site.name, type: site.type },
    });

    return site;
  }

  async findAll(
    tenantId: string,
    projectId: string | undefined,
    type: "LOAD" | "UNLOAD" | "BOTH" | undefined,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.operationalSite.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(projectId ? { projectId } : {}),
        ...(type ? { type } : {}),
        ...(isDispatcherScoped(actor) ? { project: { dispatcherId: actor.sub } } : {}),
      },
      orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async findById(tenantId: string, id: string, actor: AuthenticatedUser) {
    const site = await this.prisma.operationalSite.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
        ...(isDispatcherScoped(actor) ? { project: { dispatcherId: actor.sub } } : {}),
      },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!site) {
      throw new NotFoundException({ code: "SITE_NOT_FOUND", message: "Punto operativo no encontrado." });
    }
    return site;
  }

  async update(tenantId: string, id: string, dto: UpdateOperationalSiteDto, actor: AuthenticatedUser) {
    await this.assertExists(tenantId, id, actor);
    if (dto.projectId) {
      await this.assertProjectBelongsToTenant(tenantId, dto.projectId, actor);
    }

    const updated = await this.prisma.operationalSite.update({ where: { id }, data: dto });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "OPERATIONAL_SITE_UPDATED",
      entityType: "OperationalSite",
      entityId: id,
      newValue: dto,
    });

    return updated;
  }

  async updateStatus(tenantId: string, id: string, status: "ACTIVE" | "INACTIVE", actor: AuthenticatedUser) {
    const site = await this.assertExists(tenantId, id, actor);
    const updated = await this.prisma.operationalSite.update({ where: { id }, data: { status } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "OPERATIONAL_SITE_STATUS_CHANGED",
      entityType: "OperationalSite",
      entityId: id,
      oldValue: { status: site.status },
      newValue: { status: updated.status },
    });

    return updated;
  }

  // El DISPATCHER elimina (soft-delete) solo sus propios puntos operativos;
  // nunca se borra la fila — queda excluida de las consultas normales
  // (deletedAt: null). Eliminar un punto NO afecta a la obra ni a sus otros
  // puntos/tarifas (a diferencia de eliminar la obra, que si arrastra todo
  // — ver ProjectsService.remove). Bloqueado si tiene viajes en curso.
  async remove(tenantId: string, id: string, reason: string | undefined, actor: AuthenticatedUser) {
    const site = await this.assertExists(tenantId, id, actor);

    const activeTrips = await this.prisma.trip.count({
      where: {
        status: { in: IN_PROGRESS_STATUSES },
        OR: [{ originSiteId: id }, { destinationSiteId: id }],
      },
    });
    if (activeTrips > 0) {
      throw new ConflictException({
        code: "SITE_HAS_ACTIVE_TRIPS",
        message: "No se puede eliminar un punto operativo con viajes en curso.",
      });
    }

    await this.prisma.operationalSite.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.sub, deleteReason: reason, status: "INACTIVE" },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "OPERATIONAL_SITE_DELETED",
      entityType: "OperationalSite",
      entityId: id,
      reason,
      oldValue: { name: site.name, type: site.type },
    });
  }

  private async assertExists(tenantId: string, id: string, actor: AuthenticatedUser) {
    const site = await this.prisma.operationalSite.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
        ...(isDispatcherScoped(actor) ? { project: { dispatcherId: actor.sub } } : {}),
      },
    });
    if (!site) {
      throw new NotFoundException({ code: "SITE_NOT_FOUND", message: "Punto operativo no encontrado." });
    }
    return site;
  }

  private async assertProjectBelongsToTenant(tenantId: string, projectId: string, actor: AuthenticatedUser) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        tenantId,
        deletedAt: null,
        ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}),
      },
    });
    if (!project) {
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Obra no encontrada." });
    }
  }
}
