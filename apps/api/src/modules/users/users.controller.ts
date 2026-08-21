import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { DeleteUserDto } from "./dto/delete-user.dto";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Permissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: "Crea un usuario administrativo (TENANT_ADMIN o DISPATCHER) dentro de la empresa" })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.create(dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: "Lista los usuarios administrativos de la empresa" })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll(user);
  }

  // Declarado antes de ":id/status" por el mismo motivo que en Drivers/
  // Vehicles: "deleted" no puede interpretarse como un :id. Solo TENANT_ADMIN
  // (audit:read): es el historial de eliminaciones, no una vista operativa mas.
  @Get("deleted")
  @Permissions(PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL)
  @ApiOperation({ summary: "Historial de usuarios eliminados (solo TENANT_ADMIN) — quien elimino a quien, cuando y por que" })
  findDeleted(@Query() query: PaginationQueryDto, @TenantId() tenantId: string) {
    return this.usersService.findDeleted(tenantId, query);
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: "Activa o desactiva un usuario administrativo" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateUserStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.updateStatus(id, dto.status, user);
  }

  @Get(":id/stats")
  @Permissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: "Estadisticas de desempeno de un despachador: viajes, volquetas a cargo y dinero liquidado" })
  getDispatcherStats(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getDispatcherStats(id, user);
  }

  @Delete(":id")
  @HttpCode(204)
  @Permissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: "Elimina (soft-delete) un usuario administrativo; no se puede eliminar la propia cuenta ni al ultimo administrador activo" })
  remove(@Param("id") id: string, @Body() dto: DeleteUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.remove(id, dto.reason, user);
  }
}
