import { BadRequestException } from "@nestjs/common";
import { assertValidTransition, isTerminalStatus } from "./trip-state-machine";

describe("assertValidTransition", () => {
  it("permite las transiciones normales del ciclo de vida del viaje", () => {
    expect(() => assertValidTransition("DRAFT", "ASSIGNED")).not.toThrow();
    expect(() => assertValidTransition("ASSIGNED", "ACCEPTED")).not.toThrow();
    expect(() => assertValidTransition("ACCEPTED", "EN_ROUTE_TO_LOAD")).not.toThrow();
    expect(() => assertValidTransition("EN_ROUTE_TO_LOAD", "LOADING")).not.toThrow();
    expect(() => assertValidTransition("LOADING", "LOADED")).not.toThrow();
    expect(() => assertValidTransition("LOADED", "EN_ROUTE_TO_UNLOAD")).not.toThrow();
    expect(() => assertValidTransition("EN_ROUTE_TO_UNLOAD", "UNLOADING")).not.toThrow();
    expect(() => assertValidTransition("UNLOADING", "PENDING_VALIDATION")).not.toThrow();
    expect(() => assertValidTransition("PENDING_VALIDATION", "COMPLETED")).not.toThrow();
  });

  it("permite el flujo de liquidacion: COMPLETED -> INCLUDED_IN_SETTLEMENT -> SETTLED", () => {
    expect(() => assertValidTransition("COMPLETED", "INCLUDED_IN_SETTLEMENT")).not.toThrow();
    expect(() => assertValidTransition("INCLUDED_IN_SETTLEMENT", "SETTLED")).not.toThrow();
  });

  it("permite enviar a revision desde PENDING_VALIDATION y resolverla en COMPLETED o REJECTED", () => {
    expect(() => assertValidTransition("PENDING_VALIDATION", "UNDER_REVIEW")).not.toThrow();
    expect(() => assertValidTransition("UNDER_REVIEW", "COMPLETED")).not.toThrow();
    expect(() => assertValidTransition("UNDER_REVIEW", "REJECTED")).not.toThrow();
  });

  it("permite cancelar o cerrar manualmente desde cualquier estado no terminal", () => {
    expect(() => assertValidTransition("ASSIGNED", "CANCELLED")).not.toThrow();
    expect(() => assertValidTransition("LOADING", "MANUALLY_CLOSED")).not.toThrow();
  });

  it("rechaza saltarse pasos del flujo (ASSIGNED -> COMPLETED)", () => {
    expect(() => assertValidTransition("ASSIGNED", "COMPLETED")).toThrow(BadRequestException);
  });

  it("rechaza transiciones desde estados terminales", () => {
    expect(() => assertValidTransition("SETTLED", "COMPLETED")).toThrow(BadRequestException);
    expect(() => assertValidTransition("CANCELLED", "ASSIGNED")).toThrow(BadRequestException);
    expect(() => assertValidTransition("REJECTED", "COMPLETED")).toThrow(BadRequestException);
    expect(() => assertValidTransition("MANUALLY_CLOSED", "ASSIGNED")).toThrow(BadRequestException);
  });

  it("rechaza incluir en liquidacion un viaje que no esta COMPLETED", () => {
    expect(() => assertValidTransition("ASSIGNED", "INCLUDED_IN_SETTLEMENT")).toThrow(BadRequestException);
  });

  it("incluye el codigo de error TRIP_INVALID_TRANSITION y los estados en el detalle", () => {
    try {
      assertValidTransition("ASSIGNED", "COMPLETED");
      fail("debio lanzar BadRequestException");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        code: string;
        details: { current: string; target: string; allowed: string[] };
      };
      expect(response.code).toBe("TRIP_INVALID_TRANSITION");
      expect(response.details.current).toBe("ASSIGNED");
      expect(response.details.target).toBe("COMPLETED");
      expect(response.details.allowed).toEqual(["ACCEPTED", "CANCELLED", "MANUALLY_CLOSED"]);
    }
  });
});

describe("isTerminalStatus", () => {
  it("marca como terminales SETTLED, MANUALLY_CLOSED, CANCELLED y REJECTED", () => {
    expect(isTerminalStatus("SETTLED")).toBe(true);
    expect(isTerminalStatus("MANUALLY_CLOSED")).toBe(true);
    expect(isTerminalStatus("CANCELLED")).toBe(true);
    expect(isTerminalStatus("REJECTED")).toBe(true);
  });

  it("no marca como terminal BLOCKED_BY_INCIDENT (se resuelve devolviendo el viaje a su estado previo)", () => {
    expect(isTerminalStatus("BLOCKED_BY_INCIDENT")).toBe(false);
  });

  it("no marca como terminal los estados intermedios del ciclo de vida", () => {
    expect(isTerminalStatus("DRAFT")).toBe(false);
    expect(isTerminalStatus("ASSIGNED")).toBe(false);
    expect(isTerminalStatus("COMPLETED")).toBe(false);
    expect(isTerminalStatus("INCLUDED_IN_SETTLEMENT")).toBe(false);
  });
});
