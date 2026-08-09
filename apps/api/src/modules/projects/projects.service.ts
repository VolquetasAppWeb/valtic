import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toPaginatedResponse } from "../../common/pagination";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { CreateProjectDto } from "./dto/create-project.dto";
import type { UpdateProjectDto } from "./dto/update-project.dto";
import type { ProjectQueryDto } from "./dto/project-query.dto";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateProjectDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.project.findFirst({ where: { tenantId, code: dto.code } });
    if (existing) {
      throw new ConflictException({ code: "PROJECT_CODE_TAKEN", message: "Ya existe una obra con ese codigo." });
    }

    const { startDate, endDate, ...rest } = dto;
    const project = await this.prisma.project.create({
      data: {
        tenantId,
        ...rest,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        dispatcherId: isDispatcherScoped(actor) ? actor.sub : null,
      },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "PROJECT_CREATED",
      entityType: "Project",
      entityId: project.id,
      newValue: { name: project.name, code: project.code },
    });

    return project;
  }

  async findAll(tenantId: string, query: ProjectQueryDto, actor: AuthenticatedUser) {
    const where = {
      tenantId,
      ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { code: { contains: query.search, mode: "insensitive" as const } },
              { clientName: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { operationalSites: true } } },
      }),
      this.prisma.project.count({ where }),
    ]);

    return toPaginatedResponse(items, query.page, query.pageSize, totalItems);
  }

  async findById(tenantId: string, id: string, actor: AuthenticatedUser) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
      include: { operationalSites: true },
    });
    if (!project) {
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Obra no encontrada." });
    }
    return project;
  }

  async update(tenantId: string, id: string, dto: UpdateProjectDto, actor: AuthenticatedUser) {
    await this.assertExists(tenantId, id, actor);
    const { startDate, endDate, ...rest } = dto;

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...rest,
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
      },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "PROJECT_UPDATED",
      entityType: "Project",
      entityId: id,
      newValue: dto,
    });

    return updated;
  }

  async updateStatus(tenantId: string, id: string, status: "PLANNED" | "ACTIVE" | "PAUSED" | "CLOSED", actor: AuthenticatedUser) {
    const project = await this.assertExists(tenantId, id, actor);
    const updated = await this.prisma.project.update({ where: { id }, data: { status } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "PROJECT_STATUS_CHANGED",
      entityType: "Project",
      entityId: id,
      oldValue: { status: project.status },
      newValue: { status: updated.status },
    });

    return updated;
  }

  private async assertExists(tenantId: string, id: string, actor: AuthenticatedUser) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
    });
    if (!project) {
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Obra no encontrada." });
    }
    return project;
  }
}
