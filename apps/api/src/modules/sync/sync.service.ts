import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TripsService } from "../trips/trips.service";
import { LocationsService } from "../locations/locations.service";
import type { SyncEventDto } from "./dto/sync-push.dto";

export interface SyncEventResult {
  eventId: string;
  status: "ACKNOWLEDGED" | "REQUIRES_REVIEW" | "FAILED";
  message?: string;
}

export interface AcknowledgeResult {
  eventId: string;
  confirmed: boolean;
  verifiedAsLocation: boolean;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly locationsService: LocationsService,
  ) {}

  // Procesa el lote del outbox en orden. Cada evento es independiente: uno
  // fallido no bloquea a los demas (el cliente reintenta solo el que fallo).
  async push(tenantId: string, driverId: string, events: SyncEventDto[]): Promise<SyncEventResult[]> {
    const results: SyncEventResult[] = [];

    for (const event of events) {
      try {
        if (event.kind === "LOCATION") {
          if (!event.location) {
            results.push({ eventId: event.eventId, status: "FAILED", message: "Falta el bloque location." });
            continue;
          }
          await this.locationsService.recordBatch(tenantId, driverId, [
            {
              eventId: event.eventId,
              tripId: event.tripId,
              deviceId: event.deviceId,
              latitude: event.location.latitude,
              longitude: event.location.longitude,
              accuracy: event.location.accuracy,
              altitude: event.location.altitude,
              speed: event.location.speed,
              heading: event.location.heading,
              capturedAt: event.capturedAt,
            },
          ]);
          results.push({ eventId: event.eventId, status: "ACKNOWLEDGED" });
          continue;
        }

        // TRIP_ACTION
        if (!event.action) {
          results.push({ eventId: event.eventId, status: "FAILED", message: "Falta la accion." });
          continue;
        }

        const result = await this.tripsService.applyDriverAction(
          tenantId,
          event.tripId,
          driverId,
          event.action,
          event.deviceId,
          event.location,
        );

        if (result.status === "REQUIRES_REVIEW") {
          results.push({ eventId: event.eventId, status: "REQUIRES_REVIEW", message: result.message });
        } else {
          results.push({ eventId: event.eventId, status: "ACKNOWLEDGED" });
        }
      } catch (error) {
        results.push({
          eventId: event.eventId,
          status: "FAILED",
          message: error instanceof Error ? error.message : "Error desconocido.",
        });
      }
    }

    return results;
  }

  async pull(tenantId: string, driverId: string) {
    const trips = await this.tripsService.findMine(tenantId, driverId);
    const terminal = new Set(["SETTLED", "CANCELLED", "MANUALLY_CLOSED", "REJECTED", "INCLUDED_IN_SETTLEMENT"]);
    const activeTrip = trips.find((trip) => !terminal.has(trip.status)) ?? null;

    return { activeTrip, serverTime: new Date().toISOString() };
  }

  async acknowledge(tenantId: string, eventIds: string[]): Promise<AcknowledgeResult[]> {
    if (eventIds.length === 0) return [];

    const persistedLocations = await this.prisma.locationPoint.findMany({
      where: { tenantId, eventId: { in: eventIds } },
      select: { eventId: true },
    });
    const persistedSet = new Set(persistedLocations.map((point) => point.eventId));

    // Los eventos de tipo TRIP_ACTION no dejan un eventId persistido (su
    // idempotencia es por estado, no por id) — se confirman por definicion
    // porque /sync/push ya los proceso de forma sincrona antes de responder.
    // Para LOCATION si se verifica que el punto quedo realmente guardado.
    return eventIds.map((eventId) => ({ eventId, confirmed: true, verifiedAsLocation: persistedSet.has(eventId) }));
  }
}
