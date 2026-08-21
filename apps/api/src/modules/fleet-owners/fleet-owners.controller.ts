import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { UpdateActiveStatusDto } from "../../common/dto/update-active-status.dto";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { FleetOwnersService } from "./fleet-owners.service";
import { CreateFleetOwnerDto } from "./dto/create-fleet-owner.dto";
import { UpdateFleetOwnerDto } from "./dto/update-fleet-owner.dto";
import { FleetOwnerQueryDto } from "./dto/fleet-owner-query.dto";
import { DeleteFleetOwnerDto } from "./dto/delete-fleet-owner.dto";

@ApiTags("fleet-owners")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("fleet-owners")
export class FleetOwnersController {
  constructor(private readonly fleetOwnersService: FleetOwnersService) {}

  @Post()
  @Permissions(PERMISSIONS.FLEET_OWNERS_MANAGE)
  @ApiOperation({ summary: "Crea un propietario de flota" })
  create(@Body() dto: CreateFleetOwnerDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fleetOwnersService.create(tenantId, dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.FLEET_OWNERS_MANAGE, PERMISSIONS.FLEET_OWNERS_READ)
  @ApiOperation({ summary: "Lista propietarios de flota (solo los asignados si el actor es DISPATCHER), filtrable por estado y busqueda de texto" })
  findAll(@Query() query: FleetOwnerQueryDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fleetOwnersService.findAll(tenantId, query, user);
  }

  // Declarado antes de ":id" — de lo contrario Nest interpretaria "deleted"
  // como un valor de :id. Solo TENANT_ADMIN (audit:read): es el historial
  // de eliminaciones, no una vista operativa mas.
  @Get("deleted")
  @Permissions(PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL)
  @ApiOperation({ summary: "Historial de propietarios eliminados (solo TENANT_ADMIN) — quien elimino a quien, cuando y por que" })
  findDeleted(@Query() query: PaginationQueryDto, @TenantId() tenantId: string) {
    return this.fleetOwnersService.findDeleted(tenantId, query);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.FLEET_OWNERS_MANAGE, PERMISSIONS.FLEET_OWNERS_READ)
  @ApiOperation({ summary: "Consulta un propietario, sus vehiculos" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fleetOwnersService.findById(tenantId, id, user);
  }

  @Patch(":id")
  @Permissions(PERMISSIONS.FLEET_OWNERS_MANAGE)
  @ApiOperation({ summary: "Edita un propietario" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateFleetOwnerDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fleetOwnersService.update(tenantId, id, dto, user);
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.FLEET_OWNERS_MANAGE)
  @ApiOperation({ summary: "Activa o desactiva un propietario" })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateActiveStatusDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fleetOwnersService.updateStatus(tenantId, id, dto.status, user);
  }

  @Delete(":id")
  @HttpCode(204)
  @Permissions(PERMISSIONS.FLEET_OWNERS_MANAGE)
  @ApiOperation({ summary: "Elimina (soft-delete) un propietario; bloqueado si tiene viajes en curso" })
  remove(
    @Param("id") id: string,
    @Body() dto: DeleteFleetOwnerDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fleetOwnersService.remove(tenantId, id, dto.reason, user);
  }
}
