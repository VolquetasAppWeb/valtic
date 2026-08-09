import { BadRequestException } from "@nestjs/common";
import type { TripStatus } from "@prisma/client";

// Unica fuente de verdad para las transiciones validas del ciclo de vida de un viaje.
// Ningun otro punto del codigo debe escribir Trip.status directamente.
const TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  DRAFT: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["ACCEPTED", "CANCELLED", "MANUALLY_CLOSED"],
  ACCEPTED: ["EN_ROUTE_TO_LOAD", "CANCELLED", "MANUALLY_CLOSED"],
  EN_ROUTE_TO_LOAD: ["LOADING", "CANCELLED", "MANUALLY_CLOSED"],
  LOADING: ["LOADED", "CANCELLED", "MANUALLY_CLOSED"],
  LOADED: ["EN_ROUTE_TO_UNLOAD", "CANCELLED", "MANUALLY_CLOSED"],
  EN_ROUTE_TO_UNLOAD: ["UNLOADING", "CANCELLED", "MANUALLY_CLOSED"],
  UNLOADING: ["PENDING_VALIDATION", "CANCELLED", "MANUALLY_CLOSED"],
  PENDING_VALIDATION: ["COMPLETED", "UNDER_REVIEW", "MANUALLY_CLOSED"],
  UNDER_REVIEW: ["COMPLETED", "REJECTED", "MANUALLY_CLOSED"],
  COMPLETED: ["INCLUDED_IN_SETTLEMENT"],
  INCLUDED_IN_SETTLEMENT: ["SETTLED"],
  SETTLED: [],
  // Se resuelve devolviendo el viaje a su estado previo (guardado aparte);
  // el disparo automatico se conecta cuando exista el modulo de novedades (Fase 8).
  BLOCKED_BY_INCIDENT: [],
  MANUALLY_CLOSED: [],
  CANCELLED: [],
  REJECTED: [],
};

const TERMINAL_STATUSES: ReadonlySet<TripStatus> = new Set(["SETTLED", "MANUALLY_CLOSED", "CANCELLED", "REJECTED"]);

// Estados "en curso" (el viaje todavia se esta moviendo/gestionando activamente).
// Distinto de "no terminal": excluye ademas COMPLETED/INCLUDED_IN_SETTLEMENT/SETTLED.
// Reutilizado por reportes (KPIs del dashboard) y por la eliminacion de
// conductores (no se puede eliminar uno con viajes en curso).
export const IN_PROGRESS_STATUSES: TripStatus[] = [
  "DRAFT",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_LOAD",
  "LOADING",
  "LOADED",
  "EN_ROUTE_TO_UNLOAD",
  "UNLOADING",
  "PENDING_VALIDATION",
  "UNDER_REVIEW",
  "BLOCKED_BY_INCIDENT",
];

export function assertValidTransition(current: TripStatus, target: TripStatus): void {
  const allowed = TRANSITIONS[current] ?? [];
  if (!allowed.includes(target)) {
    throw new BadRequestException({
      code: "TRIP_INVALID_TRANSITION",
      message: `El viaje no puede pasar de ${current} a ${target}.`,
      details: { current, target, allowed },
    });
  }
}

export function isTerminalStatus(status: TripStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
