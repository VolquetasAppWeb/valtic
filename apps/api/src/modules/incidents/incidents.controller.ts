import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { IncidentsService } from "./incidents.service";
import { CreateIncidentDto } from "./dto/create-incident.dto";
import { ResolveIncidentDto } from "./dto/resolve-incident.dto";
import { IncidentQueryDto } from "./dto/incident-query.dto";

@ApiTags("incidents")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("incidents")
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @Permissions(PERMISSIONS.INCIDENTS_REPORT)
  @ApiOperation({ summary: "Reporta una novedad (conductor sobre su propio viaje, o admin/dispatcher en su nombre)" })
  create(@Body() dto: CreateIncidentDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.incidentsService.create(tenantId, dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.INCIDENTS_READ)
  @ApiOperation({ summary: "Lista novedades con filtros por estado, severidad, viaje o conductor (solo las de sus conductores si el actor es DISPATCHER)" })
  findAll(@Query() query: IncidentQueryDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.incidentsService.findAll(tenantId, query, user);
  }

  @Get("open-count")
  @Permissions(PERMISSIONS.INCIDENTS_READ)
  @ApiOperation({ summary: "Cantidad de novedades abiertas o en progreso (para alertas en el panel)" })
  countOpen(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.incidentsService.countOpen(tenantId, user).then((count) => ({ count }));
  }

  @Get(":id")
  @Permissions(PERMISSIONS.INCIDENTS_READ)
  @ApiOperation({ summary: "Consulta el detalle de una novedad, incluidas sus evidencias" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.incidentsService.findById(tenantId, id, undefined, user);
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.INCIDENTS_RESOLVE)
  @ApiOperation({ summary: "Cambia el estado de una novedad (en progreso, resuelta, descartada)" })
  resolve(
    @Param("id") id: string,
    @Body() dto: ResolveIncidentDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidentsService.resolve(tenantId, id, dto, user);
  }

  @Post(":id/evidence")
  @Permissions(PERMISSIONS.INCIDENTS_REPORT, PERMISSIONS.INCIDENTS_RESOLVE)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Adjunta una foto o documento de evidencia a una novedad" })
  addEvidence(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidentsService.addEvidence(tenantId, id, file, user);
  }
}
