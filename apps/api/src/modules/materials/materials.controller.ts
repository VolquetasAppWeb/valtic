import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { UpdateActiveStatusDto } from "../../common/dto/update-active-status.dto";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { MaterialsService } from "./materials.service";
import { CreateMaterialDto } from "./dto/create-material.dto";
import { UpdateMaterialDto } from "./dto/update-material.dto";
import { MaterialQueryDto } from "./dto/material-query.dto";

@ApiTags("materials")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("materials")
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @Permissions(PERMISSIONS.MATERIALS_MANAGE)
  @ApiOperation({ summary: "Crea un material" })
  create(@Body() dto: CreateMaterialDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.materialsService.create(tenantId, dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.MATERIALS_MANAGE, PERMISSIONS.MATERIALS_READ)
  @ApiOperation({ summary: "Lista materiales de la empresa, filtrable por estado y busqueda de texto" })
  findAll(@Query() query: MaterialQueryDto, @TenantId() tenantId: string) {
    return this.materialsService.findAll(tenantId, query);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.MATERIALS_MANAGE, PERMISSIONS.MATERIALS_READ)
  @ApiOperation({ summary: "Consulta un material" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.materialsService.findById(tenantId, id);
  }

  @Patch(":id")
  @Permissions(PERMISSIONS.MATERIALS_MANAGE)
  @ApiOperation({ summary: "Edita un material" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateMaterialDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialsService.update(tenantId, id, dto, user);
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.MATERIALS_MANAGE)
  @ApiOperation({ summary: "Activa o desactiva un material" })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateActiveStatusDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materialsService.updateStatus(tenantId, id, dto.status, user);
  }
}
