import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { SettlementsService } from "./settlements.service";
import { SettlementPeriodDto } from "./dto/settlement-period.dto";
import { SettlementQueryDto } from "./dto/settlement-query.dto";
import { CreateAdjustmentDto } from "./dto/create-adjustment.dto";
import { streamSettlementPdf } from "./export/settlement-pdf";
import { streamSettlementExcel } from "./export/settlement-excel";

@ApiTags("settlements")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("settlements")
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get("preview")
  @Permissions(PERMISSIONS.SETTLEMENTS_MANAGE, PERMISSIONS.SETTLEMENTS_CREATE_OWN)
  @ApiOperation({ summary: "Previsualiza los viajes y el calculo de una liquidacion sin crearla (solo propietarios propios si el actor es DISPATCHER)" })
  preview(@Query() query: SettlementPeriodDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settlementsService.preview(tenantId, query, user);
  }

  @Post()
  @Permissions(PERMISSIONS.SETTLEMENTS_MANAGE, PERMISSIONS.SETTLEMENTS_CREATE_OWN)
  @ApiOperation({ summary: "Genera el borrador de una liquidacion para un propietario y periodo (solo propietarios propios si el actor es DISPATCHER)" })
  create(@Body() dto: SettlementPeriodDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settlementsService.create(tenantId, dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.SETTLEMENTS_MANAGE, PERMISSIONS.SETTLEMENTS_READ_OWN)
  @ApiOperation({ summary: "Lista liquidaciones con filtros por propietario o estado (solo las propias segun el actor)" })
  findAll(@Query() query: SettlementQueryDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settlementsService.findAll(tenantId, query, user);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.SETTLEMENTS_MANAGE, PERMISSIONS.SETTLEMENTS_READ_OWN)
  @ApiOperation({ summary: "Consulta el detalle de una liquidacion" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settlementsService.findById(tenantId, id, user);
  }

  @Post(":id/adjustments")
  @Permissions(PERMISSIONS.SETTLEMENTS_MANAGE)
  @ApiOperation({ summary: "Agrega un ajuste (bono, descuento o correccion) a una liquidacion en borrador" })
  addAdjustment(
    @Param("id") id: string,
    @Body() dto: CreateAdjustmentDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settlementsService.addAdjustment(tenantId, id, dto, user);
  }

  @Patch(":id/approve")
  @Permissions(PERMISSIONS.SETTLEMENTS_APPROVE)
  @ApiOperation({ summary: "Aprueba una liquidacion en borrador (bloquea cambios futuros)" })
  approve(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settlementsService.approve(tenantId, id, user);
  }

  @Patch(":id/cancel")
  @Permissions(PERMISSIONS.SETTLEMENTS_MANAGE)
  @ApiOperation({ summary: "Cancela un borrador de liquidacion y libera sus viajes" })
  cancel(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settlementsService.cancel(tenantId, id, user);
  }

  @Get(":id/export/pdf")
  @Permissions(PERMISSIONS.SETTLEMENTS_MANAGE, PERMISSIONS.SETTLEMENTS_READ_OWN)
  @ApiOperation({ summary: "Descarga la liquidacion en PDF" })
  async exportPdf(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const data = await this.settlementsService.toExportData(tenantId, id, user);
    streamSettlementPdf(res, data);
  }

  @Get(":id/export/excel")
  @Permissions(PERMISSIONS.SETTLEMENTS_MANAGE, PERMISSIONS.SETTLEMENTS_READ_OWN)
  @ApiOperation({ summary: "Descarga la liquidacion en Excel" })
  async exportExcel(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const data = await this.settlementsService.toExportData(tenantId, id, user);
    await streamSettlementExcel(res, data);
  }
}
