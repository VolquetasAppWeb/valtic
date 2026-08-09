import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { ReportsService } from "./reports.service";
import { PeriodQueryDto } from "./dto/period-query.dto";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

@ApiTags("reports")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("dashboard")
  @Permissions(PERMISSIONS.REPORTS_READ)
  @ApiOperation({ summary: "Indicadores generales de la operacion y viajes completados por dia (?days=, default 14); scope propio si el actor es DISPATCHER" })
  getDashboard(@Query() query: DashboardQueryDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getDashboard(tenantId, user, query);
  }

  @Get("settlements-by-owner")
  @Permissions(PERMISSIONS.SETTLEMENTS_MANAGE)
  @ApiOperation({ summary: "Valor liquidado (aprobado o pagado) por propietario de flota en un periodo (solo TENANT_ADMIN: liquidaciones no son datos propios de un dispatcher)" })
  getSettlementsByOwner(@Query() query: PeriodQueryDto, @TenantId() tenantId: string) {
    return this.reportsService.getSettlementsByOwner(tenantId, query);
  }

  @Get("trips-by-project")
  @Permissions(PERMISSIONS.REPORTS_READ)
  @ApiOperation({ summary: "Viajes completados por obra en un periodo; scope propio si el actor es DISPATCHER" })
  getTripsByProject(@Query() query: PeriodQueryDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getTripsByProject(tenantId, query, user);
  }
}
