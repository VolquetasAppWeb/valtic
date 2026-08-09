import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { LocationPointDto } from "./dto/location-point.dto";

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Idempotente: LocationPoint.eventId es unico, createMany+skipDuplicates
  // ignora silenciosamente los puntos que el outbox offline ya envio antes.
  async recordBatch(tenantId: string, driverId: string, points: LocationPointDto[]): Promise<number> {
    if (points.length === 0) return 0;

    const result = await this.prisma.locationPoint.createMany({
      data: points.map((point) => ({
        tenantId,
        tripId: point.tripId,
        driverId,
        deviceId: point.deviceId,
        eventId: point.eventId,
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
        altitude: point.altitude,
        speed: point.speed,
        heading: point.heading,
        capturedAt: new Date(point.capturedAt),
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  async findByTrip(tenantId: string, tripId: string, limit = 200) {
    return this.prisma.locationPoint.findMany({
      where: { tenantId, tripId },
      orderBy: { capturedAt: "desc" },
      take: limit,
    });
  }
}
