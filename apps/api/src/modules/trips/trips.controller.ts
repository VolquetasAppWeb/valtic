import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { TripsService } from "./trips.service";
import { CreateTripDto } from "./dto/create-trip.dto";
import { TripQueryDto } from "./dto/trip-query.dto";
import { CancelTripDto } from "./dto/cancel-trip.dto";
import { ManualCloseTripDto } from "./dto/manual-close-trip.dto";
import { DriverActionDto } from "./dto/driver-action.dto";
import { ReviewTripDto } from "./dto/review-trip.dto";
import { UploadVoucherDto } from "./dto/upload-voucher.dto";

@ApiTags("trips")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("trips")
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @Permissions(PERMISSIONS.TRIPS_CREATE)
  @ApiOperation({ summary: "Crea y asigna un viaje (conductor + vehiculo), toma un snapshot de la tarifa vigente" })
  create(@Body() dto: CreateTripDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tripsService.create(tenantId, dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.TRIPS_READ)
  @ApiOperation({ summary: "Lista viajes con filtros por estado, obra, conductor o vehiculo (solo los propios si el actor es DISPATCHER)" })
  findAll(@Query() query: TripQueryDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tripsService.findAll(tenantId, query, user);
  }

  @Get("active")
  @Permissions(PERMISSIONS.TRIPS_READ)
  @ApiOperation({ summary: "Lista viajes activos (no terminados) para el monitor en vivo" })
  findActive(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tripsService.findActive(tenantId, user);
  }

  @Get("mine")
  @Permissions(PERMISSIONS.TRIPS_READ_OWN)
  @ApiOperation({ summary: "Viajes recientes del conductor autenticado (incluye el activo, si existe)" })
  findMine(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tripsService.findMine(tenantId, user.sub);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.TRIPS_READ, PERMISSIONS.TRIPS_READ_OWN)
  @ApiOperation({ summary: "Consulta el detalle y la linea de tiempo de un viaje" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    const restrictToDriverId = user.kind === "driver" ? user.sub : undefined;
    return this.tripsService.findById(tenantId, id, restrictToDriverId, user);
  }

  @Patch(":id/cancel")
  @Permissions(PERMISSIONS.TRIPS_CANCEL)
  @ApiOperation({ summary: "Cancela un viaje (requiere motivo)" })
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelTripDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tripsService.cancel(tenantId, id, dto.reason, user);
  }

  @Patch(":id/manual-close")
  @Permissions(PERMISSIONS.TRIPS_MANUAL_CLOSE)
  @ApiOperation({ summary: "Cierra manualmente un viaje (requiere motivo y usuario autorizado)" })
  manualClose(
    @Param("id") id: string,
    @Body() dto: ManualCloseTripDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tripsService.manualClose(tenantId, id, dto.reason, user);
  }

  @Patch(":id/driver-progress")
  @Permissions(PERMISSIONS.TRIPS_UPDATE_OWN_PROGRESS)
  @ApiOperation({ summary: "Avanza el estado de un viaje propio (aceptar, iniciar, confirmar cargue/descargue)" })
  driverProgress(
    @Param("id") id: string,
    @Body() dto: DriverActionDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tripsService.applyDriverAction(tenantId, id, user.sub, dto.action, dto.deviceId, undefined);
  }

  @Post(":id/voucher")
  @Permissions(PERMISSIONS.TRIPS_UPDATE_OWN_PROGRESS, PERMISSIONS.TRIPS_MANUAL_CLOSE)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: "Sube la foto del vale (opcional): extrae cantidad/numero de vale por OCR y guarda GPS/hora de captura, todo como referencia" })
  uploadVoucher(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadVoucherDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tripsService.uploadVoucher(
      tenantId,
      id,
      file,
      { latitude: dto.latitude, longitude: dto.longitude, capturedAt: dto.capturedAt },
      user,
    );
  }

  @Patch(":id/review")
  @Permissions(PERMISSIONS.TRIPS_REVIEW)
  @ApiOperation({ summary: "Aprueba o rechaza un viaje en revision (UNDER_REVIEW tras validacion QR fallida)" })
  review(
    @Param("id") id: string,
    @Body() dto: ReviewTripDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tripsService.review(tenantId, id, dto.decision, dto.notes, user);
  }
}
