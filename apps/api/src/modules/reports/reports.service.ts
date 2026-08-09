import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import { IN_PROGRESS_STATUSES } from "../trips/domain/trip-state-machine";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { PeriodQueryDto } from "./dto/period-query.dto";
import type { DashboardQueryDto } from "./dto/dashboard-query.dto";

const DEFAULT_TRIPS_BY_DAY_WINDOW = 14;

function resolvePeriod(query: PeriodQueryDto): { start: Date; end: Date } {
  if (query.periodStart && query.periodEnd) {
    return { start: new Date(query.periodStart), end: new Date(`${query.periodEnd}T23:59:59.999Z`) };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string, actor: AuthenticatedUser, query: DashboardQueryDto = {}) {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const scoped = isDispatcherScoped(actor);
    const driverScope: Prisma.TripWhereInput = scoped ? { driver: { dispatcherId: actor.sub } } : {};
    const ownerScope = scoped ? { dispatcherId: actor.sub } : {};

    const busyDrivers = await this.prisma.trip.findMany({
      where: { tenantId, status: { in: IN_PROGRESS_STATUSES }, ...driverScope },
      select: { driverId: true },
      distinct: ["driverId"],
    });

    const [
      activeTrips,
      completedToday,
      pendingReview,
      openIncidents,
      activeVehicles,
      availableDrivers,
      settledValue,
      tripsByDay,
    ] = await Promise.all([
      this.prisma.trip.count({ where: { tenantId, status: { in: IN_PROGRESS_STATUSES }, ...driverScope } }),
      this.prisma.trip.count({ where: { tenantId, completedAt: { gte: startOfToday }, ...driverScope } }),
      this.prisma.trip.count({ where: { tenantId, status: "UNDER_REVIEW", ...driverScope } }),
      this.prisma.incident.count({
        where: { tenantId, status: "OPEN", ...(scoped ? { driver: { dispatcherId: actor.sub } } : {}) },
      }),
      this.prisma.vehicle.count({ where: { tenantId, status: "ACTIVE", ...ownerScope } }),
      this.prisma.driver.count({
        where: { tenantId, status: "ACTIVE", ...ownerScope, id: { notIn: busyDrivers.map((d) => d.driverId) } },
      }),
      scoped
        ? this.prisma.settlementItem.aggregate({
            where: {
              trip: { driver: { dispatcherId: actor.sub } },
              settlement: { tenantId, status: { in: ["APPROVED", "PAID"] }, approvedAt: { gte: startOfMonth } },
            },
            _sum: { total: true },
          })
        : this.prisma.settlement.aggregate({
            where: { tenantId, status: { in: ["APPROVED", "PAID"] }, approvedAt: { gte: startOfMonth } },
            _sum: { total: true },
          }),
      this.getTripsByDay(tenantId, driverScope, query.days ?? DEFAULT_TRIPS_BY_DAY_WINDOW),
    ]);

    return {
      activeTrips,
      completedToday,
      pendingReview,
      openIncidents,
      activeVehicles,
      availableDrivers,
      settledValuePeriod: Number(settledValue._sum.total ?? 0),
      currency: "COP",
      tripsByDay,
    };
  }

  private async getTripsByDay(
    tenantId: string,
    driverScope: Prisma.TripWhereInput,
    windowDays: number,
  ): Promise<Array<{ date: string; completed: number }>> {
    const today = new Date();
    const days: Array<{ date: string; start: Date; end: Date }> = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
      const start = day;
      const end = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);
      days.push({ date: day.toISOString().slice(0, 10), start, end });
    }

    const counts = await Promise.all(
      days.map((day) =>
        this.prisma.trip.count({ where: { tenantId, completedAt: { gte: day.start, lte: day.end }, ...driverScope } }),
      ),
    );

    return days.map((day, index) => ({ date: day.date, completed: counts[index] ?? 0 }));
  }

  async getSettlementsByOwner(tenantId: string, query: PeriodQueryDto) {
    const { start, end } = resolvePeriod(query);

    const grouped = await this.prisma.settlement.groupBy({
      by: ["fleetOwnerId"],
      where: { tenantId, status: { in: ["APPROVED", "PAID"] }, approvedAt: { gte: start, lte: end } },
      _sum: { total: true },
      _count: { _all: true },
    });

    if (grouped.length === 0) return [];

    const owners = await this.prisma.fleetOwner.findMany({
      where: { id: { in: grouped.map((g) => g.fleetOwnerId) } },
      select: { id: true, name: true },
    });
    const ownerById = new Map(owners.map((o) => [o.id, o.name]));

    return grouped
      .map((g) => ({
        fleetOwnerId: g.fleetOwnerId,
        fleetOwnerName: ownerById.get(g.fleetOwnerId) ?? "—",
        settlementCount: g._count._all,
        totalValue: Number(g._sum.total ?? 0),
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }

  async getTripsByProject(tenantId: string, query: PeriodQueryDto, actor: AuthenticatedUser) {
    const { start, end } = resolvePeriod(query);

    const grouped = await this.prisma.trip.groupBy({
      by: ["projectId"],
      where: {
        tenantId,
        completedAt: { gte: start, lte: end },
        ...(isDispatcherScoped(actor) ? { driver: { dispatcherId: actor.sub } } : {}),
      },
      _count: { _all: true },
    });

    if (grouped.length === 0) return [];

    const projects = await this.prisma.project.findMany({
      where: { id: { in: grouped.map((g) => g.projectId) } },
      select: { id: true, name: true },
    });
    const projectById = new Map(projects.map((p) => [p.id, p.name]));

    return grouped
      .map((g) => ({
        projectId: g.projectId,
        projectName: projectById.get(g.projectId) ?? "—",
        completedTrips: g._count._all,
      }))
      .sort((a, b) => b.completedTrips - a.completedTrips);
  }
}
