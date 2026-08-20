import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor, FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
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
import { UploadDriverDocumentDto } from "./dto/upload-driver-document.dto";
import { ResetDriverPinDto } from "./dto/reset-driver-pin.dto";
import { DriverQueryDto } from "./dto/driver-query.dto";
import { DeleteDriverDto } from "./dto/delete-driver.dto";

const DOCUMENT_FILE_LIMITS = { fileSize: 10 * 1024 * 1024 };

@ApiTags("drivers")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("drivers")
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @Permissions(PERMISSIONS.DRIVERS_MANAGE)
  @ApiOperation({
    summary: "Registra un conductor; el PIN se genera automaticamente y viene en la respuesta (tambien queda disponible despues via GET /:id/pin)",
  })
  create(@Body() dto: CreateDriverDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.create(tenantId, dto, user);
  }

  // Declarados antes de ":id" por el mismo motivo que "deleted" mas abajo.
  @Post("extract-cedula")
  @Permissions(PERMISSIONS.DRIVERS_MANAGE)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "front", maxCount: 1 },
        { name: "back", maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: DOCUMENT_FILE_LIMITS },
    ),
  )
  @ApiOperation({
    summary: "Lee las fotos de cedula (frente y reverso) por OCR y devuelve todos los campos leidos para autocompletar (no guarda nada)",
  })
  extractCedula(@UploadedFiles() files: { front?: Express.Multer.File[]; back?: Express.Multer.File[] }) {
    const front = files.front?.[0];
    const back = files.back?.[0];
    if (!front || !back) {
      throw new BadRequestException({ code: "CEDULA_PHOTOS_REQUIRED", message: "Faltan las fotos de frente y reverso de la cedula." });
    }
    return this.driversService.extractCedula([front, back]);
  }

  @Post("extract-license")
  @Permissions(PERMISSIONS.DRIVERS_MANAGE)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "front", maxCount: 1 },
        { name: "back", maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: DOCUMENT_FILE_LIMITS },
    ),
  )
  @ApiOperation({
    summary: "Lee las fotos de la licencia de conduccion (frente y reverso) por OCR y devuelve todos los campos leidos (no guarda nada)",
  })
  extractLicense(@UploadedFiles() files: { front?: Express.Multer.File[]; back?: Express.Multer.File[] }) {
    const front = files.front?.[0];
    const back = files.back?.[0];
    if (!front || !back) {
      throw new BadRequestException({ code: "LICENSE_PHOTOS_REQUIRED", message: "Faltan las fotos de frente y reverso de la licencia." });
    }
    return this.driversService.extractLicense([front, back]);
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

  @Post(":id/documents")
  @Permissions(PERMISSIONS.DRIVERS_MANAGE)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: DOCUMENT_FILE_LIMITS }))
  @ApiOperation({ summary: "Sube una foto al historico del conductor (nunca sobreescribe una anterior)" })
  uploadDocument(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDriverDocumentDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.driversService.uploadDocument(tenantId, id, file, user, dto.kind);
  }

  @Get(":id/documents")
  @Permissions(PERMISSIONS.DRIVERS_MANAGE, PERMISSIONS.DRIVERS_READ)
  @ApiOperation({ summary: "Historico de fotos de cedula y licencia subidas para el conductor" })
  listDocuments(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.listDocuments(tenantId, id, user);
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

  @Get(":id/pin")
  @Permissions(PERMISSIONS.DRIVERS_MANAGE)
  @ApiOperation({ summary: "Consulta el PIN actual (en texto plano) de un conductor" })
  getPin(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.getPin(tenantId, id, user);
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
