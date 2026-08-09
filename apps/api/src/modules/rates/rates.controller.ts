import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { RatesService } from "./rates.service";
import { CreateRateDto } from "./dto/create-rate.dto";
import { UpdateRateStatusDto } from "./dto/update-rate-status.dto";

@ApiTags("rates")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("rates")
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Post()
  @Permissions(PERMISSIONS.RATES_MANAGE)
  @ApiOperation({ summary: "Crea una tarifa (las tarifas no se editan, se versionan por vigencia)" })
  create(@Body() dto: CreateRateDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ratesService.create(tenantId, dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.RATES_MANAGE, PERMISSIONS.RATES_READ)
  @ApiOperation({ summary: "Lista tarifas, con filtros e historial" })
  findAll(
    @TenantId() tenantId: string,
    @Query("projectId") projectId?: string,
    @Query("materialId") materialId?: string,
    @Query("originSiteId") originSiteId?: string,
    @Query("destinationSiteId") destinationSiteId?: string,
  ) {
    return this.ratesService.findAll(tenantId, { projectId, materialId, originSiteId, destinationSiteId });
  }

  @Get(":id")
  @Permissions(PERMISSIONS.RATES_MANAGE, PERMISSIONS.RATES_READ)
  @ApiOperation({ summary: "Consulta una tarifa" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.ratesService.findById(tenantId, id);
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.RATES_MANAGE)
  @ApiOperation({ summary: "Activa, desactiva o expira una tarifa" })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateRateStatusDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ratesService.updateStatus(tenantId, id, dto.status, user);
  }
}
