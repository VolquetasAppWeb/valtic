import type { TripEventType, TripStatus } from "@prisma/client";

export const DRIVER_ACTIONS = [
  "ACCEPT",
  "START_TO_LOAD",
  "ARRIVE_LOAD",
  "CONFIRM_LOADED",
  "START_TO_UNLOAD",
  "ARRIVE_UNLOAD",
] as const;

export type DriverActionType = (typeof DRIVER_ACTIONS)[number];

export interface DriverActionSpec {
  targetStatus: TripStatus;
  eventType: TripEventType;
  timestampField?: "acceptedAt" | "startedAt" | "loadedAt";
}

export const DRIVER_ACTION_SPEC: Record<DriverActionType, DriverActionSpec> = {
  ACCEPT: { targetStatus: "ACCEPTED", eventType: "ACCEPTED", timestampField: "acceptedAt" },
  START_TO_LOAD: { targetStatus: "EN_ROUTE_TO_LOAD", eventType: "STARTED_TO_LOAD", timestampField: "startedAt" },
  ARRIVE_LOAD: { targetStatus: "LOADING", eventType: "ARRIVED_AT_LOAD" },
  CONFIRM_LOADED: { targetStatus: "LOADED", eventType: "LOADING_CONFIRMED", timestampField: "loadedAt" },
  START_TO_UNLOAD: { targetStatus: "EN_ROUTE_TO_UNLOAD", eventType: "DEPARTED_TO_UNLOAD" },
  ARRIVE_UNLOAD: { targetStatus: "UNLOADING", eventType: "ARRIVED_AT_UNLOAD" },
};

// Orden del camino "feliz" del conductor, usado para decidir si una accion
// repetida (reenviada por el outbox offline) ya fue aplicada (idempotencia).
export const DRIVER_PROGRESS_ORDER: TripStatus[] = [
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_LOAD",
  "LOADING",
  "LOADED",
  "EN_ROUTE_TO_UNLOAD",
  "UNLOADING",
  "PENDING_VALIDATION",
  "COMPLETED",
];
