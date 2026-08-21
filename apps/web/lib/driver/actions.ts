import { addOutboxEvent, type DriverActionType, type OutboxLocation } from "./outbox";
import { getCurrentPosition, type CapturedPosition } from "./geolocation";
import { syncOutbox } from "./sync-engine";

export function getOrCreateDeviceId(): string {
  const key = "valtic_driver_device_id";
  if (typeof window === "undefined") return "server";
  let deviceId = window.localStorage.getItem(key);
  if (!deviceId) {
    deviceId = `web-${Math.random().toString(16).slice(2)}-${Date.now()}`;
    window.localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

// Encola una accion de progreso en el outbox (siempre local primero) y
// dispara un intento de sincronizacion inmediato sin bloquear la UI.
//
// knownPosition viene del rastreo GPS en curso (useGpsTracking), que ya esta
// pidiendole posicion al dispositivo de fondo desde que se acepto el viaje.
// Si la pasamos, evitamos pedirle al GPS una posicion nueva desde cero en
// cada boton (eso es lo que hacia que "Registrando..." se demorara hasta 10s
// por tap, sobre todo con señal debil). Solo se hace una peticion nueva
// (bloqueante) cuando todavia no hay ninguna posicion conocida.
export async function queueDriverAction(
  tripId: string,
  action: DriverActionType,
  knownPosition?: CapturedPosition | null,
): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  let location: OutboxLocation | undefined;

  try {
    const position = knownPosition ?? (await getCurrentPosition());
    location = {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      altitude: position.altitude,
      speed: position.speed,
      heading: position.heading,
    };
  } catch {
    // Sin permiso o sin GPS disponible: la accion se registra igual, sin ubicacion.
  }

  await addOutboxEvent({
    kind: "TRIP_ACTION",
    tripId,
    deviceId,
    capturedAt: new Date().toISOString(),
    action,
    location,
  });

  void syncOutbox();
}

export async function queueLocationPoint(tripId: string, location: OutboxLocation): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  await addOutboxEvent({
    kind: "LOCATION",
    tripId,
    deviceId,
    capturedAt: new Date().toISOString(),
    location,
  });
  void syncOutbox();
}
