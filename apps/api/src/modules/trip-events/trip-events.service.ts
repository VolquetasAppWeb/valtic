import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma, TripEventSource, TripEventType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface RecordTripEventInput {
  tenantId: string;
  tripId: string;
  type: TripEventType;
  source: TripEventSource;
  actorUserId?: string | null;
  driverId?: string | null;
  deviceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  payload: Record<string, unknown>;
  occurredAt?: Date;
}

@Injectable()
export class TripEventsService {
  constructor(private readonly prisma: PrismaService) {}

  // Los eventos de un viaje son append-only y forman una cadena de hashes:
  // eventHash = SHA256(previousHash + tripId + type + payloadCanonico + occurredAt)
  // Esto da trazabilidad tipo "libro mayor" sin la complejidad de blockchain.
  async record(input: RecordTripEventInput, tx: Prisma.TransactionClient = this.prisma) {
    const occurredAt = input.occurredAt ?? new Date();

    const lastEvent = await tx.tripEvent.findFirst({
      where: { tripId: input.tripId },
      orderBy: { createdAt: "desc" },
      select: { eventHash: true },
    });

    const previousHash = lastEvent?.eventHash ?? null;
    const canonicalPayload = this.canonicalize(input.payload);
    const eventHash = createHash("sha256")
      .update(`${previousHash ?? ""}${input.tripId}${input.type}${canonicalPayload}${occurredAt.toISOString()}`)
      .digest("hex");

    return tx.tripEvent.create({
      data: {
        tenantId: input.tenantId,
        tripId: input.tripId,
        type: input.type,
        source: input.source,
        actorUserId: input.actorUserId,
        driverId: input.driverId,
        deviceId: input.deviceId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy,
        payload: input.payload as Prisma.InputJsonValue,
        previousHash,
        eventHash,
        occurredAt,
      },
    });
  }

  async findByTrip(tenantId: string, tripId: string) {
    return this.prisma.tripEvent.findMany({
      where: { tenantId, tripId },
      orderBy: { createdAt: "asc" },
    });
  }

  private canonicalize(payload: Record<string, unknown>): string {
    const sortedKeys = Object.keys(payload).sort();
    const sorted: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sorted[key] = payload[key];
    }
    return JSON.stringify(sorted);
  }
}
