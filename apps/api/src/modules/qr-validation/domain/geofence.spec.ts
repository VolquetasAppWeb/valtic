import { evaluateGeofence, haversineDistanceMeters } from "./geofence";

describe("haversineDistanceMeters", () => {
  it("retorna 0 para el mismo punto", () => {
    expect(haversineDistanceMeters(4.711, -74.0721, 4.711, -74.0721)).toBe(0);
  });

  it("calcula una distancia conocida entre Bogota y Medellin (~240km) con margen razonable", () => {
    // Bogota (4.7110, -74.0721) -> Medellin (6.2442, -75.5812)
    const distance = haversineDistanceMeters(4.711, -74.0721, 6.2442, -75.5812);
    expect(distance).toBeGreaterThan(230_000);
    expect(distance).toBeLessThan(250_000);
  });

  it("es simetrica (distancia A->B es igual a B->A)", () => {
    const ab = haversineDistanceMeters(4.711, -74.0721, 6.2442, -75.5812);
    const ba = haversineDistanceMeters(6.2442, -75.5812, 4.711, -74.0721);
    expect(ab).toBeCloseTo(ba, 6);
  });
});

describe("evaluateGeofence", () => {
  const baseInput = {
    pointLatitude: 4.711,
    pointLongitude: -74.0721,
    siteLatitude: 4.711,
    siteLongitude: -74.0721,
    siteRadiusMeters: 100,
    accuracyMeters: 15,
    locationCapturedAt: new Date("2026-08-05T12:00:00.000Z"),
    now: new Date("2026-08-05T12:00:10.000Z"),
    maxAccuracyMeters: 50,
    maxLocationAgeSeconds: 60,
  };

  it("es valido cuando el punto esta dentro del radio, con buena precision y ubicacion reciente", () => {
    const result = evaluateGeofence(baseInput);
    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.distanceMeters).toBe(0);
  });

  it("es invalido cuando el punto esta fuera del radio de la geocerca", () => {
    // ~0.01 grados de latitud son ~1111m, muy por fuera del radio de 100m
    const result = evaluateGeofence({ ...baseInput, pointLatitude: 4.721 });
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("radio permitido"))).toBe(true);
  });

  it("es invalido cuando la precision del GPS supera el maximo permitido", () => {
    const result = evaluateGeofence({ ...baseInput, accuracyMeters: 80 });
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes("precision del GPS"))).toBe(true);
  });

  it("es invalido cuando la ubicacion es demasiado antigua", () => {
    const result = evaluateGeofence({ ...baseInput, now: new Date("2026-08-05T12:05:00.000Z") });
    expect(result.valid).toBe(false);
    expect(result.locationAgeSeconds).toBe(300);
    expect(result.reasons.some((r) => r.includes("antiguedad"))).toBe(true);
  });

  it("acumula multiples razones cuando fallan varias condiciones a la vez", () => {
    const result = evaluateGeofence({
      ...baseInput,
      pointLatitude: 4.721,
      accuracyMeters: 80,
      now: new Date("2026-08-05T12:05:00.000Z"),
    });
    expect(result.valid).toBe(false);
    expect(result.reasons).toHaveLength(3);
  });

  it("nunca retorna una antiguedad de ubicacion negativa", () => {
    const result = evaluateGeofence({ ...baseInput, now: new Date("2026-08-05T11:00:00.000Z") });
    expect(result.locationAgeSeconds).toBe(0);
  });
});
