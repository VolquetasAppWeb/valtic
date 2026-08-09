import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PERMISSIONS } from "@valtic/types";
import { toPaginatedResponse } from "../../common/pagination";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { AuditQueryDto } from "./dto/audit-query.dto";

export interface RecordAuditEventInput {
  tenantId?: string | null;
  actorUserId?: string | null;
  actorDriverId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        tenantId: input.tenantId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorDriverId: input.actorDriverId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValue: input.oldValue === undefined ? undefined : (input.oldValue as object),
        newValue: input.newValue === undefined ? undefined : (input.newValue as object),
        reason: input.reason,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  async findAll(actor: AuthenticatedUser, query: AuditQueryDto) {
    const canReadGlobal = actor.permissions.includes(PERMISSIONS.AUDIT_READ_GLOBAL);

    const where: Prisma.AuditEventWhereInput = {
      // Un actor con solo audit:read (TENANT_ADMIN) siempre queda forzado a
      // su propio tenant, sin importar lo que pida en la query. Solo
      // audit:read-global (SUPER_ADMIN) puede ver otros tenants o todos.
      ...(canReadGlobal ? (query.tenantId ? { tenantId: query.tenantId } : {}) : { tenantId: actor.tenantId }),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.actorKind === "DRIVER" ? { actorDriverId: { not: null } } : {}),
      ...(query.actorKind === "USER" ? { actorUserId: { not: null } } : {}),
      ...(query.actorKind === "SYSTEM" ? { actorUserId: null, actorDriverId: null } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
          actorDriver: { select: { id: true, firstName: true, lastName: true, documentNumber: true } },
          tenant: { select: { id: true, name: true } },
        },
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return toPaginatedResponse(items, query.page, query.pageSize, totalItems);
  }
}
