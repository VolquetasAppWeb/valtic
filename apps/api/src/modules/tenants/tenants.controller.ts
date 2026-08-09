import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantsService } from "./tenants.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { UpdateTenantStatusDto } from "./dto/update-tenant-status.dto";

@ApiTags("tenants")
@ApiBearerAuth()
@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Permissions(PERMISSIONS.TENANTS_MANAGE)
  @ApiOperation({ summary: "Crea una nueva empresa contratista (tenant) y aprovisiona sus roles por defecto" })
  create(@Body() dto: CreateTenantDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.create(dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.TENANTS_MANAGE)
  @ApiOperation({ summary: "Lista todas las empresas registradas" })
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(":id")
  @Permissions(PERMISSIONS.TENANTS_MANAGE)
  @ApiOperation({ summary: "Consulta el detalle de una empresa" })
  findOne(@Param("id") id: string) {
    return this.tenantsService.findById(id);
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.TENANTS_MANAGE)
  @ApiOperation({ summary: "Activa, suspende o bloquea una empresa" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateTenantStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.updateStatus(id, dto.status, user);
  }
}
