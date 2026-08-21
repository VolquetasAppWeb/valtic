import { BadRequestException, Body, Controller, Get, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { OperationsService } from "./operations.service";
import { ExtractOperationsSetupDto } from "./dto/extract-operations-setup.dto";
import { QuickSetupDto } from "./dto/quick-setup.dto";

const FILE_LIMITS = { fileSize: 10 * 1024 * 1024 };

// "Configuracion automatica de obra": fusiona Obras + Puntos operativos +
// Tarifas en un solo flujo guiado por IA en vez de 3 formularios manuales
// separados (ver OperationsService para el detalle).
@ApiTags("operations")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("operations")
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Post("extract-setup")
  @Permissions(PERMISSIONS.PROJECTS_MANAGE)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "files", maxCount: 5 },
        { name: "audio", maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: FILE_LIMITS },
    ),
  )
  @ApiOperation({
    summary:
      "Lee una orden de trabajo/cotizacion (fotos, audio y/o texto) y devuelve un borrador de obra + puntos + tarifas (no guarda nada)",
  })
  extractSetup(
    @UploadedFiles() files: { files?: Express.Multer.File[]; audio?: Express.Multer.File[] } | undefined,
    @Body() dto: ExtractOperationsSetupDto,
    @TenantId() tenantId: string,
  ) {
    const images = files?.files ?? [];
    const audio = files?.audio?.[0];
    const hasText = !!dto.text?.trim();
    if (!hasText && images.length === 0 && !audio) {
      throw new BadRequestException({
        code: "SETUP_INPUT_REQUIRED",
        message: "Pega el texto de la orden, adjunta al menos una foto, o graba/sube un audio.",
      });
    }
    return this.operationsService.extractSetup(
      images.map((f) => f.buffer),
      audio?.buffer,
      dto.text,
      tenantId,
    );
  }

  @Post("quick-setup")
  @Permissions(PERMISSIONS.PROJECTS_MANAGE)
  @ApiOperation({ summary: "Crea obra + puntos operativos + tarifas en un solo paso, a partir del borrador ya revisado" })
  quickSetup(@Body() dto: QuickSetupDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.operationsService.quickSetup(tenantId, dto, user);
  }

  @Get("resolve-address")
  @Permissions(PERMISSIONS.PROJECTS_MANAGE, PERMISSIONS.SITES_MANAGE)
  @ApiOperation({
    summary:
      "Convierte una descripcion coloquial de una ubicacion (ej. 'la Caracas con 72') en direcciones formales con coordenadas, usando IA + OpenStreetMap",
  })
  resolveAddress(@Query("query") query: string, @Query("skipAi") skipAi?: string) {
    if (!query?.trim()) {
      throw new BadRequestException({ code: "QUERY_REQUIRED", message: "Escribe una direccion o descripcion." });
    }
    return this.operationsService.resolveAddress(query.trim(), skipAi === "true");
  }
}
