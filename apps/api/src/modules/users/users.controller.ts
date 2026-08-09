import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";

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

  @Patch(":id/status")
  @Permissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: "Activa o desactiva un usuario administrativo" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateUserStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.updateStatus(id, dto.status, user);
  }
}
