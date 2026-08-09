import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { DriversService } from "./drivers.service";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { UpdateDriverDto } from "./dto/update-driver.dto";
import { UpdateDriverStatusDto } from "./dto/update-driver-status.dto";
import { ResetDriverPinDto } from "./dto/reset-driver-pin.dto";
import { DriverQueryDto } from "./dto/driver-query.dto";
import { DeleteDriverDto } from "./dto/delete-driver.dto";

@ApiTags("drivers")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("drivers")
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @Permissions(PERMISSIONS.DRIVERS_MANAGE)
  @ApiOperation({ summary: "Registra un conductor (incluye PIN inicial)" })
  create(@Body() dto: CreateDriverDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.create(tenantId, dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.DRIVERS_MANAGE, PERMISSIONS.DRIVERS_READ)
  @ApiOperation({ summary: "Lista conductores de la empresa (solo los propios si el actor es DISPATCHER), filtrable por estado y busqueda de texto" })
  findAll(@Query() query: DriverQueryDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.findAll(tenantId, query, user);
  }

  // Declarado antes de ":id" — de lo contrario Nest interpretaria "deleted"
  // como un valor de :id. Solo TENANT_ADMIN (audit:read): es el historial
  // de eliminaciones, no una vista operativa mas.
  @Get("deleted")
  @Permissions(PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL)
  @ApiOperation({ summary: "Historial de conductores eliminados (solo TENANT_ADMIN) — quien elimino a quien, cuando y por que" })
  findDeleted(@Query() query: PaginationQueryDto, @TenantId() tenantId: string) {
    return this.driversService.findDeleted(tenantId, query);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.DRIVERS_MANAGE, PERMISSIONS.DRIVERS_READ)
  @ApiOperation({ summary: "Consulta un conductor, su vehiculo actual y viajes recientes" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.findById(tenantId, id, user);
  }

  @Patch(":id")
  @Permissions(PERMISSIONS.DRIVERS_MANAGE)
  @ApiOperation({ summary: "Edita los datos de un conductor" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDriverDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.driversService.update(tenantId, id, dto, user);
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.DRIVERS_MANAGE)
  @ApiOperation({ summary: "Activa, desactiva o suspende un conductor" })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateDriverStatusDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.driversService.updateStatus(tenantId, id, dto.status, user);
  }

  @Patch(":id/reset-pin")
  @Permissions(PERMISSIONS.DRIVERS_MANAGE)
  @ApiOperation({ summary: "Restablece el PIN de un conductor y limpia bloqueos" })
  resetPin(
    @Param("id") id: string,
    @Body() dto: ResetDriverPinDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.driversService.resetPin(tenantId, id, dto.newPin, user);
  }

  @Delete(":id")
  @HttpCode(204)
  @Permissions(PERMISSIONS.DRIVERS_MANAGE)
  @ApiOperation({ summary: "Elimina (soft-delete) un conductor; bloqueado si tiene viajes en curso. Queda en el historial de eliminados." })
  remove(
    @Param("id") id: string,
    @Body() dto: DeleteDriverDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.driversService.remove(tenantId, id, dto.reason, user);
  }
}
