import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { UpdateActiveStatusDto } from "../../common/dto/update-active-status.dto";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { OperationalSitesService } from "./operational-sites.service";
import { CreateOperationalSiteDto } from "./dto/create-operational-site.dto";
import { UpdateOperationalSiteDto } from "./dto/update-operational-site.dto";

@ApiTags("operational-sites")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("operational-sites")
export class OperationalSitesController {
  constructor(private readonly sitesService: OperationalSitesService) {}

  @Post()
  @Permissions(PERMISSIONS.SITES_MANAGE)
  @ApiOperation({ summary: "Crea un punto operativo (cargue/descargue) con coordenadas y geocerca" })
  create(@Body() dto: CreateOperationalSiteDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.create(tenantId, dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.SITES_MANAGE, PERMISSIONS.SITES_READ)
  @ApiOperation({ summary: "Lista puntos operativos, filtrables por obra y tipo (solo los propios si el actor es DISPATCHER)" })
  findAll(
    @Query("projectId") projectId: string | undefined,
    @Query("type") type: "LOAD" | "UNLOAD" | "BOTH" | undefined,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sitesService.findAll(tenantId, projectId, type, user);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.SITES_MANAGE, PERMISSIONS.SITES_READ)
  @ApiOperation({ summary: "Consulta un punto operativo" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.findById(tenantId, id, user);
  }

  @Patch(":id")
  @Permissions(PERMISSIONS.SITES_MANAGE)
  @ApiOperation({ summary: "Edita un punto operativo" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateOperationalSiteDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sitesService.update(tenantId, id, dto, user);
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.SITES_MANAGE)
  @ApiOperation({ summary: "Activa o desactiva un punto operativo" })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateActiveStatusDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sitesService.updateStatus(tenantId, id, dto.status, user);
  }
}
