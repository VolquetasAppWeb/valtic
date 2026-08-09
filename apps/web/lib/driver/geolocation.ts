export type GeolocationPermissionState = "granted" | "denied" | "prompt" | "unsupported";

export interface CapturedPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  capturedAt: string;
}

export async function checkGeolocationPermission(): Promise<GeolocationPermissionState> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return "unsupported";
  }
  if (!("permissions" in navigator)) {
    return "prompt";
  }
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state as GeolocationPermissionState;
  } catch {
    return "prompt";
  }
}

export function getCurrentPosition(): Promise<CapturedPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Geolocalizacion no disponible en este dispositivo."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toCapturedPosition(position)),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 },
    );
  });
}

export function watchPosition(
  onPosition: (position: CapturedPosition) => void,
  onError: (error: GeolocationPositionError) => void,
): number | null {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return null;
  }
  return navigator.geolocation.watchPosition((position) => onPosition(toCapturedPosition(position)), onError, {
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 5_000,
  });
}

export function clearPositionWatch(watchId: number | null): void {
  if (watchId !== null && typeof navigator !== "undefined" && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(watchId);
  }
}

function toCapturedPosition(position: GeolocationPosition): CapturedPosition {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude ?? undefined,
    speed: position.coords.speed ?? undefined,
    heading: position.coords.heading ?? undefined,
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}
