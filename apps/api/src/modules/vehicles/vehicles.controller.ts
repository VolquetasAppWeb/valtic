import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { VehiclesService } from "./vehicles.service";
import { CreateVehicleDto } from "./dto/create-vehicle.dto";
import { UpdateVehicleDto } from "./dto/update-vehicle.dto";
import { UpdateVehicleStatusDto } from "./dto/update-vehicle-status.dto";
import { VehicleQueryDto } from "./dto/vehicle-query.dto";
import { DeleteVehicleDto } from "./dto/delete-vehicle.dto";

@ApiTags("vehicles")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @Permissions(PERMISSIONS.VEHICLES_MANAGE)
  @ApiOperation({ summary: "Registra un vehiculo" })
  create(@Body() dto: CreateVehicleDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.create(tenantId, dto, user);
  }

  // Declarado antes de ":id" por el mismo motivo que "deleted" mas abajo.
  @Post("extract-registration")
  @Permissions(PERMISSIONS.VEHICLES_MANAGE)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({
    summary:
      "Lee una foto de tarjeta de propiedad por OCR y devuelve placa/marca/linea/modelo/licencia de transito para autocompletar el formulario (no guarda nada)",
  })
  extractRegistration(@UploadedFile() file: Express.Multer.File) {
    return this.vehiclesService.extractRegistration(file);
  }

  @Get()
  @Permissions(PERMISSIONS.VEHICLES_MANAGE, PERMISSIONS.VEHICLES_READ)
  @ApiOperation({ summary: "Lista vehiculos de la empresa (solo los propios si el actor es DISPATCHER), filtrable por estado y busqueda de texto" })
  findAll(@Query() query: VehicleQueryDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.findAll(tenantId, query, user);
  }

  // Declarado antes de ":id" — de lo contrario Nest interpretaria "deleted"
  // como un valor de :id. Solo TENANT_ADMIN (audit:read): es el historial
  // de eliminaciones, no una vista operativa mas.
  @Get("deleted")
  @Permissions(PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL)
  @ApiOperation({ summary: "Historial de vehiculos eliminados (solo TENANT_ADMIN) — quien elimino a cual, cuando y por que" })
  findDeleted(@Query() query: PaginationQueryDto, @TenantId() tenantId: string) {
    return this.vehiclesService.findDeleted(tenantId, query);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.VEHICLES_MANAGE, PERMISSIONS.VEHICLES_READ)
  @ApiOperation({ summary: "Consulta un vehiculo, su propietario, conductor y viajes recientes" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.findById(tenantId, id, user);
  }

  @Post(":id/documents")
  @Permissions(PERMISSIONS.VEHICLES_MANAGE)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Sube una foto de tarjeta de propiedad al historico del vehiculo (nunca sobreescribe una anterior)" })
  uploadDocument(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.uploadDocument(tenantId, id, file, user);
  }

  @Get(":id/documents")
  @Permissions(PERMISSIONS.VEHICLES_MANAGE, PERMISSIONS.VEHICLES_READ)
  @ApiOperation({ summary: "Historico de fotos de tarjeta de propiedad subidas para el vehiculo" })
  listDocuments(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.listDocuments(tenantId, id, user);
  }

  @Patch(":id")
  @Permissions(PERMISSIONS.VEHICLES_MANAGE)
  @ApiOperation({ summary: "Edita un vehiculo" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateVehicleDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.update(tenantId, id, dto, user);
  }

  @Patch(":id/status")
  @Permissions(PERMISSIONS.VEHICLES_MANAGE)
  @ApiOperation({ summary: "Cambia el estado de un vehiculo" })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateVehicleStatusDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.updateStatus(tenantId, id, dto.status, user);
  }

  @Delete(":id")
  @HttpCode(204)
  @Permissions(PERMISSIONS.VEHICLES_MANAGE)
  @ApiOperation({ summary: "Elimina (soft-delete) un vehiculo; bloqueado si tiene viajes en curso. Queda en el historial de eliminados." })
  remove(
    @Param("id") id: string,
    @Body() dto: DeleteVehicleDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.remove(tenantId, id, dto.reason, user);
  }
}
