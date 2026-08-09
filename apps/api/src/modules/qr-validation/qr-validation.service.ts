import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { TripsService } from "../trips/trips.service";
import { encodeQrToken, verifyQrToken, type QrPayload } from "./domain/qr-token";
import { evaluateGeofence } from "./domain/geofence";
import type { AppConfig } from "../../config/configuration";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { ValidateQrDto } from "./dto/validate-qr.dto";

@Injectable()
export class QrValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly auditService: AuditService,
    private readonly tripsService: TripsService,
  ) {}

  async generate(tenantId: string, operationalSiteId: string, actor: AuthenticatedUser) {
    const site = await this.prisma.operationalSite.findFirst({ where: { id: operationalSiteId, tenantId } });
    if (!site) {
      throw new NotFoundException({ code: "SITE_NOT_FOUND", message: "Punto operativo no encontrado." });
    }

    const qrConfig = this.configService.get("qr", { infer: true });
    const checkpointId = randomUUID();
    const nonce = randomUUID();
    const issuedAt = Date.now();
    const expiresAt = issuedAt + qrConfig.expirationSeconds * 1000;

    const payload: QrPayload = {
      version: 1,
      tenantId,
      siteId: operationalSiteId,
      checkpointId,
      nonce,
      issuedAt,
      expiresAt,
    };

    const token = encodeQrToken(payload, qrConfig.signingSecret);

    await this.prisma.checkpointQr.create({
      data: {
        id: checkpointId,
        tenantId,
        operationalSiteId,
        nonce,
        expiresAt: new Date(expiresAt),
        status: "ACTIVE",
        signature: token,
      },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.kind === "user" ? actor.sub : null,
      actorDriverId: actor.kind === "driver" ? actor.sub : null,
      action: "QR_GENERATED",
      entityType: "CheckpointQr",
      entityId: checkpointId,
      newValue: { operationalSiteId, expiresAt: new Date(expiresAt).toISOString() },
    });

    return { token, checkpointId, expiresAt: new Date(expiresAt).toISOString(), siteName: site.name };
  }

  // El conductor ya no depende de que un dispatcher/admin le genere y le
  // comparta un QR por fuera de la app: el la solicita el mismo desde su
  // propio viaje ("codigo de confirmacion"), scopeado a su viaje activo en
  // descargue. Reutiliza exactamente la misma infraestructura de seguridad
  // (token firmado de un solo uso + validacion de geocerca al confirmar).
  async generateForOwnTrip(tenantId: string, tripId: string, actor: AuthenticatedUser) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId } });
    if (!trip) {
      throw new NotFoundException({ code: "TRIP_NOT_FOUND", message: "Viaje no encontrado." });
    }
    if (trip.driverId !== actor.sub) {
      throw new ForbiddenException({ code: "TRIP_NOT_OWNED", message: "Este viaje no esta asignado a este conductor." });
    }
    if (trip.status !== "UNLOADING") {
      throw new BadRequestException({
        code: "TRIP_NOT_READY_FOR_QR",
        message: `El viaje debe estar en descargue para solicitar el codigo de confirmacion (estado actual: ${trip.status}).`,
      });
    }

    return this.generate(tenantId, trip.destinationSiteId, actor);
  }

  async validate(tenantId: string, dto: ValidateQrDto, actor: AuthenticatedUser) {
    const qrConfig = this.configService.get("qr", { infer: true });
    const geofenceConfig = this.configService.get("geofence", { infer: true });

    const verification = verifyQrToken(dto.token, qrConfig.signingSecret);
    if (!verification.valid || !verification.payload) {
      throw new BadRequestException({ code: "QR_INVALID", message: "El codigo QR no es valido." });
    }

    const payload = verification.payload;
    if (payload.tenantId !== tenantId) {
      throw new ForbiddenException({ code: "QR_TENANT_MISMATCH", message: "El codigo QR pertenece a otra empresa." });
    }
    if (payload.expiresAt < Date.now()) {
      throw new BadRequestException({ code: "QR_EXPIRED", message: "El codigo QR expiro. Solicita uno nuevo." });
    }

    const checkpoint = await this.prisma.checkpointQr.findFirst({
      where: { id: payload.checkpointId, tenantId, nonce: payload.nonce },
    });
    if (!checkpoint) {
      throw new NotFoundException({ code: "QR_NOT_FOUND", message: "El codigo QR no existe." });
    }
    if (checkpoint.status === "USED") {
      throw new ConflictException({ code: "QR_ALREADY_USED", message: "Este codigo QR ya fue utilizado." });
    }
    if (checkpoint.status !== "ACTIVE" || checkpoint.expiresAt.getTime() < Date.now()) {
      await this.prisma.checkpointQr.update({ where: { id: checkpoint.id }, data: { status: "EXPIRED" } });
      throw new BadRequestException({ code: "QR_EXPIRED", message: "El codigo QR expiro. Solicita uno nuevo." });
    }

    const trip = await this.prisma.trip.findFirst({ where: { id: dto.tripId, tenantId } });
    if (!trip) {
      throw new NotFoundException({ code: "TRIP_NOT_FOUND", message: "Viaje no encontrado." });
    }
    if (trip.driverId !== actor.sub) {
      throw new ForbiddenException({ code: "TRIP_NOT_OWNED", message: "Este viaje no esta asignado a este conductor." });
    }
    if (trip.status !== "UNLOADING") {
      throw new BadRequestException({
        code: "TRIP_NOT_READY_FOR_QR",
        message: `El viaje debe estar en descargue para escanear el QR de cierre (estado actual: ${trip.status}).`,
      });
    }
    if (checkpoint.operationalSiteId !== trip.destinationSiteId) {
      throw new BadRequestException({ code: "QR_WRONG_SITE", message: "Este codigo QR no corresponde al punto de descargue de este viaje." });
    }

    // Uso unico: se marca consumido apenas se confirma que la firma, el
    // nonce y el contexto (viaje/sitio) son legitimos — independientemente
    // de si la geocerca despues resulta valida o no (evita reintentos infinitos).
    await this.prisma.checkpointQr.update({
      where: { id: checkpoint.id },
      data: { status: "USED", usedAt: new Date() },
    });

    const site = await this.prisma.operationalSite.findUniqueOrThrow({ where: { id: checkpoint.operationalSiteId } });

    const geofenceResult = evaluateGeofence({
      pointLatitude: dto.latitude,
      pointLongitude: dto.longitude,
      siteLatitude: site.latitude,
      siteLongitude: site.longitude,
      siteRadiusMeters: site.geofenceRadius,
      accuracyMeters: dto.accuracy,
      locationCapturedAt: new Date(dto.capturedAt),
      now: new Date(),
      maxAccuracyMeters: geofenceConfig.maxAccuracyMeters,
      maxLocationAgeSeconds: geofenceConfig.maxLocationAgeSeconds,
    });

    const updatedTrip = await this.tripsService.applyQrValidationResult(tenantId, trip.id, actor.sub, {
      passed: geofenceResult.valid,
      reasons: geofenceResult.reasons,
      deviceId: dto.deviceId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
      checkpointId: checkpoint.id,
    });

    await this.auditService.record({
      tenantId,
      actorDriverId: actor.sub,
      action: geofenceResult.valid ? "QR_VALIDATION_PASSED" : "QR_VALIDATION_FAILED",
      entityType: "Trip",
      entityId: trip.id,
      newValue: { distanceMeters: Math.round(geofenceResult.distanceMeters), reasons: geofenceResult.reasons },
    });

    return {
      outcome: geofenceResult.valid ? "COMPLETED" : "UNDER_REVIEW",
      reasons: geofenceResult.reasons,
      distanceMeters: Math.round(geofenceResult.distanceMeters),
      trip: updatedTrip,
    };
  }
}
