import { haversineDistanceMeters } from "../../qr-validation/domain/geofence";

export interface TripForCalculation {
  id: string;
  sequentialNumber: number;
  actualQuantity: unknown;
  estimatedQuantity: unknown;
  rateSnapshot: unknown;
  originSite: { latitude: number; longitude: number };
  destinationSite: { latitude: number; longitude: number };
}

export interface SettlementItemCalculation {
  tripId: string;
  rateType: string;
  quantity: number;
  unitValue: number;
  total: number;
  rateSnapshot: Record<string, unknown>;
}

// Nunca recalcula con la tarifa vigente actual: todo sale del snapshot que
// quedo congelado en el viaje al crearlo (seccion 16 del alcance).
export function calculateSettlementItem(trip: TripForCalculation): SettlementItemCalculation {
  const snapshot = trip.rateSnapshot as { rateType?: string; value?: string } | null;
  if (!snapshot?.rateType || snapshot.value === undefined) {
    throw new Error(`El viaje #${trip.sequentialNumber} no tiene un snapshot de tarifa valido.`);
  }

  const unitValue = Number(snapshot.value);
  const rateType = snapshot.rateType;

  let quantity: number;
  switch (rateType) {
    case "PER_TRIP":
    case "FIXED":
      quantity = 1;
      break;
    case "PER_TON":
    case "PER_CUBIC_METER":
      // La cantidad real (pesada/medida) es la fuente correcta; si no se
      // registro, se usa la estimada del viaje como respaldo (limitacion
      // documentada: no hay integracion con bascula en el MVP).
      quantity = Number(trip.actualQuantity ?? trip.estimatedQuantity ?? 0);
      break;
    case "PER_KILOMETER":
      // Distancia en linea recta (Haversine) entre origen y destino como
      // aproximacion; no hay integracion con un servicio de ruteo real.
      quantity =
        haversineDistanceMeters(
          trip.originSite.latitude,
          trip.originSite.longitude,
          trip.destinationSite.latitude,
          trip.destinationSite.longitude,
        ) / 1000;
      break;
    default:
      quantity = 1;
  }

  const total = Math.round(quantity * unitValue * 100) / 100;

  return {
    tripId: trip.id,
    rateType,
    quantity: Math.round(quantity * 100) / 100,
    unitValue,
    total,
    rateSnapshot: snapshot as Record<string, unknown>,
  };
}
