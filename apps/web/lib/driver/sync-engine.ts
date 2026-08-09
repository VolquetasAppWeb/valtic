import { apiClient } from "@/lib/api-client";
import { getAllOutboxEvents, getSendableEvents, removeOutboxEvent, updateOutboxEvent, type OutboxEvent } from "./outbox";

interface SyncPushResult {
  results: { eventId: string; status: "ACKNOWLEDGED" | "REQUIRES_REVIEW" | "FAILED"; message?: string }[];
  serverTime: string;
}

export interface SyncSummary {
  sent: number;
  acknowledged: number;
  requiresReview: number;
  failed: number;
}

let syncInFlight: Promise<SyncSummary> | null = null;

// Vacia el outbox local hacia /sync/push. Es seguro llamarla repetidamente
// (interval + evento 'online' + acciones nuevas): si ya hay una sincronizacion
// en curso, las llamadas subsecuentes esperan la misma promesa.
export function syncOutbox(): Promise<SyncSummary> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = performSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function performSync(): Promise<SyncSummary> {
  const pending = await getSendableEvents();
  const summary: SyncSummary = { sent: 0, acknowledged: 0, requiresReview: 0, failed: 0 };

  if (pending.length === 0) {
    return summary;
  }

  await Promise.all(pending.map((event) => updateOutboxEvent(event.eventId, { status: "SENDING" })));

  const batch = pending.map(toPushPayload);
  summary.sent = batch.length;

  try {
    const response = await apiClient.post<SyncPushResult>("/sync/push", { events: batch });

    for (const result of response.results) {
      if (result.status === "ACKNOWLEDGED") {
        await removeOutboxEvent(result.eventId);
        summary.acknowledged += 1;
      } else if (result.status === "REQUIRES_REVIEW") {
        await updateOutboxEvent(result.eventId, { status: "REQUIRES_REVIEW", lastError: result.message });
        summary.requiresReview += 1;
      } else {
        await markFailed(result.eventId, result.message);
        summary.failed += 1;
      }
    }
  } catch (error) {
    // Sin conexion o error de red: todo el lote vuelve a PENDING para reintentar despues.
    await Promise.all(
      pending.map((event) =>
        markFailed(event.eventId, error instanceof Error ? error.message : "Error de red", true),
      ),
    );
    summary.failed = pending.length;
    summary.sent = 0;
  }

  return summary;
}

async function markFailed(eventId: string, message: string | undefined, backToPending = false): Promise<void> {
  const events = await getAllOutboxEvents();
  const current = events.find((event) => event.eventId === eventId);
  const retryCount = (current?.retryCount ?? 0) + 1;
  await updateOutboxEvent(eventId, {
    status: backToPending ? "PENDING" : "FAILED",
    retryCount,
    lastError: message,
  });
}

function toPushPayload(event: OutboxEvent) {
  return {
    eventId: event.eventId,
    kind: event.kind,
    tripId: event.tripId,
    deviceId: event.deviceId,
    capturedAt: event.capturedAt,
    action: event.action,
    location: event.location,
  };
}
