import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { UpdateProjectStatusDto } from "./dto/update-project-status.dto";
import { ProjectQueryDto } from "./dto/project-query.dto";

@ApiTags("projects")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @Permissions(PERMISSIONS.PROJECTS_MANAGE)
  @ApiOperation({ summary: "Crea una obra/proyecto" })
  create(@Body() dto: CreateProjectDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.create(tenantId, dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.PROJECTS_MANAGE, PERMISSIONS.PROJECTS_READ)
  @ApiOperation({ summary: "Lista las obras de la empresa (solo las propias si el actor es DISPATCHER), filtrable por estado y busqueda de texto" })
  findAll(@Query() query: ProjectQueryDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findAll(tenantId, query, user);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.PROJECTS_MANAGE, PERMISSIONS.PROJECTS_READ)
  @ApiOperation({ summary: "Consulta una obra y sus puntos operativos" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findById(tenantId, id, user);
  }

  @Patch(":id")
  @Permissions(PERMISSIONS.PROJECTS_MANAGE)
  @ApiOperation({ summary: "Edita una obra" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.update(tenantId, id, dto, user);
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.PROJECTS_MANAGE)
  @ApiOperation({ summary: "Cambia el estado de una obra" })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateProjectStatusDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.updateStatus(tenantId, id, dto.status, user);
  }
}
