import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { QrValidationService } from "./qr-validation.service";
import { GenerateQrDto } from "./dto/generate-qr.dto";
import { ValidateQrDto } from "./dto/validate-qr.dto";
import { RequestCloseCodeDto } from "./dto/request-close-code.dto";

@ApiTags("qr")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("qr")
export class QrValidationController {
  constructor(private readonly qrValidationService: QrValidationService) {}

  @Post("generate")
  @Permissions(PERMISSIONS.QR_GENERATE)
  @ApiOperation({ summary: "Genera un codigo QR firmado y de un solo uso para un punto operativo" })
  generate(@Body() dto: GenerateQrDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.qrValidationService.generate(tenantId, dto.operationalSiteId, user);
  }

  @Post("request-close-code")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Permissions(PERMISSIONS.QR_VALIDATE_SCAN)
  @ApiOperation({ summary: "El conductor solicita su propio codigo de confirmacion para cerrar su viaje en descargue" })
  requestCloseCode(@Body() dto: RequestCloseCodeDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.qrValidationService.generateForOwnTrip(tenantId, dto.tripId, user);
  }

  @Post("validate")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Permissions(PERMISSIONS.QR_VALIDATE_SCAN)
  @ApiOperation({ summary: "Valida un QR escaneado (o ingresado manualmente) contra el viaje y la geocerca" })
  validate(@Body() dto: ValidateQrDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.qrValidationService.validate(tenantId, dto, user);
  }
}
