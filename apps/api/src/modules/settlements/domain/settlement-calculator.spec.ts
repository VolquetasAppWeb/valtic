import { haversineDistanceMeters } from "../../qr-validation/domain/geofence";
import { calculateSettlementItem, type TripForCalculation } from "./settlement-calculator";

function buildTrip(overrides: Partial<TripForCalculation> = {}): TripForCalculation {
  return {
    id: "trip-1",
    sequentialNumber: 1,
    actualQuantity: null,
    estimatedQuantity: null,
    rateSnapshot: { rateType: "PER_TRIP", value: "85000", currency: "COP" },
    originSite: { latitude: 4.711, longitude: -74.0721 },
    destinationSite: { latitude: 4.711, longitude: -74.0721 },
    ...overrides,
  };
}

describe("calculateSettlementItem", () => {
  it("PER_TRIP: cantidad siempre 1, total = valor de la tarifa", () => {
    const item = calculateSettlementItem(buildTrip({ rateSnapshot: { rateType: "PER_TRIP", value: "85000" } }));
    expect(item.quantity).toBe(1);
    expect(item.unitValue).toBe(85000);
    expect(item.total).toBe(85000);
    expect(item.rateType).toBe("PER_TRIP");
  });

  it("FIXED: se comporta igual que PER_TRIP (cantidad 1)", () => {
    const item = calculateSettlementItem(buildTrip({ rateSnapshot: { rateType: "FIXED", value: "120000" } }));
    expect(item.quantity).toBe(1);
    expect(item.total).toBe(120000);
  });

  it("PER_TON: usa actualQuantity cuando esta disponible", () => {
    const item = calculateSettlementItem(
      buildTrip({
        rateSnapshot: { rateType: "PER_TON", value: "15000" },
        actualQuantity: "12.5",
        estimatedQuantity: "10",
      }),
    );
    expect(item.quantity).toBe(12.5);
    expect(item.total).toBe(187_500);
  });

  it("PER_TON: usa estimatedQuantity como respaldo si no hay actualQuantity", () => {
    const item = calculateSettlementItem(
      buildTrip({ rateSnapshot: { rateType: "PER_TON", value: "15000" }, actualQuantity: null, estimatedQuantity: "10" }),
    );
    expect(item.quantity).toBe(10);
    expect(item.total).toBe(150_000);
  });

  it("PER_TON: usa 0 si no hay actualQuantity ni estimatedQuantity", () => {
    const item = calculateSettlementItem(
      buildTrip({ rateSnapshot: { rateType: "PER_TON", value: "15000" }, actualQuantity: null, estimatedQuantity: null }),
    );
    expect(item.quantity).toBe(0);
    expect(item.total).toBe(0);
  });

  it("PER_CUBIC_METER: se comporta igual que PER_TON (actual con respaldo en estimada)", () => {
    const item = calculateSettlementItem(
      buildTrip({ rateSnapshot: { rateType: "PER_CUBIC_METER", value: "20000" }, estimatedQuantity: "8" }),
    );
    expect(item.quantity).toBe(8);
    expect(item.total).toBe(160_000);
  });

  it("PER_KILOMETER: calcula la cantidad con Haversine entre origen y destino, en kilometros", () => {
    const origin = { latitude: 4.711, longitude: -74.0721 };
    const destination = { latitude: 6.2442, longitude: -75.5812 }; // Bogota -> Medellin, ~240km
    const expectedKm = haversineDistanceMeters(origin.latitude, origin.longitude, destination.latitude, destination.longitude) / 1000;

    const item = calculateSettlementItem(
      buildTrip({ rateSnapshot: { rateType: "PER_KILOMETER", value: "2000" }, originSite: origin, destinationSite: destination }),
    );

    expect(item.quantity).toBeGreaterThan(230);
    expect(item.quantity).toBeLessThan(250);
    expect(item.quantity).toBeCloseTo(expectedKm, 2);
    expect(item.total).toBeCloseTo(expectedKm * 2000, -1);
  });

  it("redondea el total a 2 decimales", () => {
    const item = calculateSettlementItem(
      buildTrip({ rateSnapshot: { rateType: "PER_TON", value: "333.333" }, estimatedQuantity: "3" }),
    );
    expect(item.total).toBe(1000);
  });

  it("lanza un error si el snapshot no tiene rateType", () => {
    expect(() => calculateSettlementItem(buildTrip({ rateSnapshot: { value: "1000" } }))).toThrow(
      /no tiene un snapshot de tarifa valido/,
    );
  });

  it("lanza un error si el snapshot no tiene value", () => {
    expect(() => calculateSettlementItem(buildTrip({ rateSnapshot: { rateType: "PER_TRIP" } }))).toThrow(
      /no tiene un snapshot de tarifa valido/,
    );
  });

  it("lanza un error si el snapshot es null", () => {
    expect(() => calculateSettlementItem(buildTrip({ rateSnapshot: null }))).toThrow(
      /no tiene un snapshot de tarifa valido/,
    );
  });

  it("conserva el tripId y el rateSnapshot original en el resultado", () => {
    const snapshot = { rateType: "PER_TRIP", value: "50000", currency: "COP" };
    const item = calculateSettlementItem(buildTrip({ id: "trip-42", rateSnapshot: snapshot }));
    expect(item.tripId).toBe("trip-42");
    expect(item.rateSnapshot).toEqual(snapshot);
  });
});
