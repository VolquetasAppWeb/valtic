const EARTH_RADIUS_METERS = 6_371_000;

export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export interface GeofenceCheckInput {
  pointLatitude: number;
  pointLongitude: number;
  siteLatitude: number;
  siteLongitude: number;
  siteRadiusMeters: number;
  accuracyMeters: number;
  locationCapturedAt: Date;
  now: Date;
  maxAccuracyMeters: number;
  maxLocationAgeSeconds: number;
}

export interface GeofenceCheckResult {
  valid: boolean;
  distanceMeters: number;
  locationAgeSeconds: number;
  reasons: string[];
}

// Valida una ubicacion contra la geocerca de un punto operativo. Tres
// condiciones independientes, todas deben cumplirse (seccion 13 del alcance).
export function evaluateGeofence(input: GeofenceCheckInput): GeofenceCheckResult {
  const distanceMeters = haversineDistanceMeters(
    input.pointLatitude,
    input.pointLongitude,
    input.siteLatitude,
    input.siteLongitude,
  );
  const locationAgeSeconds = Math.max(0, (input.now.getTime() - input.locationCapturedAt.getTime()) / 1000);

  const reasons: string[] = [];
  if (distanceMeters > input.siteRadiusMeters) {
    reasons.push(
      `La ubicacion esta a ${Math.round(distanceMeters)}m del punto operativo (radio permitido: ${input.siteRadiusMeters}m).`,
    );
  }
  if (input.accuracyMeters > input.maxAccuracyMeters) {
    reasons.push(
      `La precision del GPS (${Math.round(input.accuracyMeters)}m) supera el maximo permitido (${input.maxAccuracyMeters}m).`,
    );
  }
  if (locationAgeSeconds > input.maxLocationAgeSeconds) {
    reasons.push(
      `La ubicacion tiene ${Math.round(locationAgeSeconds)}s de antiguedad (maximo permitido: ${input.maxLocationAgeSeconds}s).`,
    );
  }

  return { valid: reasons.length === 0, distanceMeters, locationAgeSeconds, reasons };
}
