import { openOutboxDb, OUTBOX_STORE } from "./indexeddb";

export type DriverActionType =
  | "ACCEPT"
  | "START_TO_LOAD"
  | "ARRIVE_LOAD"
  | "CONFIRM_LOADED"
  | "START_TO_UNLOAD"
  | "ARRIVE_UNLOAD";

export type OutboxEventStatus = "PENDING" | "SENDING" | "ACKNOWLEDGED" | "FAILED" | "REQUIRES_REVIEW";

export interface OutboxLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
}

export interface OutboxEvent {
  eventId: string;
  kind: "TRIP_ACTION" | "LOCATION";
  tripId: string;
  deviceId: string;
  capturedAt: string;
  action?: DriverActionType;
  location?: OutboxLocation;
  status: OutboxEventStatus;
  retryCount: number;
  lastError?: string;
  createdAt: string;
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openOutboxDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, mode);
        const store = tx.objectStore(OUTBOX_STORE);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Error en IndexedDB."));
      }),
  );
}

function generateEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function addOutboxEvent(
  input: Omit<OutboxEvent, "eventId" | "status" | "retryCount" | "createdAt">,
): Promise<OutboxEvent> {
  const event: OutboxEvent = {
    ...input,
    eventId: generateEventId(),
    status: "PENDING",
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };
  await withStore("readwrite", (store) => store.add(event));
  return event;
}

export async function getAllOutboxEvents(): Promise<OutboxEvent[]> {
  return withStore("readonly", (store) => store.getAll());
}

export async function getSendableEvents(): Promise<OutboxEvent[]> {
  const all = await getAllOutboxEvents();
  return all
    .filter((event) => event.status === "PENDING" || event.status === "FAILED")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateOutboxEvent(eventId: string, patch: Partial<OutboxEvent>): Promise<void> {
  const db = await openOutboxDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const getRequest = store.get(eventId);
    getRequest.onsuccess = () => {
      const existing = getRequest.result as OutboxEvent | undefined;
      if (!existing) {
        resolve();
        return;
      }
      const putRequest = store.put({ ...existing, ...patch });
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function removeOutboxEvent(eventId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(eventId));
}

export async function countPendingOutboxEvents(): Promise<number> {
  const all = await getAllOutboxEvents();
  return all.filter((event) => event.status !== "ACKNOWLEDGED").length;
}
