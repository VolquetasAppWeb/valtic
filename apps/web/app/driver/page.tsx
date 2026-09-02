"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Route } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient } from "@/lib/api-client";
import type { Trip } from "@/lib/api-types";

// "COMPLETED" faltaba aca — sin el, un viaje ya completado seguia
// contando como "viaje activo" y mostraba el boton "Ver viaje activo".
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "SETTLED",
  "CANCELLED",
  "MANUALLY_CLOSED",
  "REJECTED",
  "INCLUDED_IN_SETTLEMENT",
]);

export default function DriverHomePage(): JSX.Element {
  const router = useRouter();
  const driver = useAuthStore((state) => state.driver);
  const clear = useAuthStore((state) => state.clear);

  const { data: trips, isLoading } = useQuery({
    queryKey: ["trips", "mine"],
    queryFn: () => apiClient.get<Trip[]>("/trips/mine"),
  });

  async function handleLogout(): Promise<void> {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Si falla la llamada, igual limpiamos la sesion local.
    }
    clear();
    router.push("/driver/login");
  }

  const activeTrip = trips?.find((trip) => !TERMINAL_STATUSES.has(trip.status));
  const recentTrips = (trips ?? []).filter((trip) => TERMINAL_STATUSES.has(trip.status)).slice(0, 5);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Hola, {driver?.firstName ?? "conductor"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Documento {driver?.documentNumber}</p>
            {driver?.dispatcherName && (
              <p className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                Cuenta de {driver.dispatcherName}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Cerrar sesion">
            <LogOut className="h-4 w-4" />
          </Button>
        </CardHeader>
      </Card>

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground">Cargando...</p>
      ) : activeTrip ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground">Viaje #{activeTrip.sequentialNumber}</CardTitle>
              <StatusBadge status={activeTrip.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              {activeTrip.originSite.name} → {activeTrip.destinationSite.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {activeTrip.project.name} · {activeTrip.vehicle.plate}
            </p>
            <Button className="w-full" onClick={() => router.push(`/driver/trip/${activeTrip.id}`)}>
              Ver viaje activo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <Route className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Sin viaje activo</p>
            <p className="text-xs text-muted-foreground">
              Cuando el despachador te asigne un viaje, aparecera aqui.
            </p>
          </CardContent>
        </Card>
      )}

      {recentTrips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">Viajes recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Historial de solo lectura — un viaje ya terminado no se
                vuelve a abrir, para no confundir al conductor haciendole
                pensar que todavia tiene algo pendiente ahi. */}
            {recentTrips.map((trip) => (
              <div
                key={trip.id}
                className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
              >
                <span>
                  #{trip.sequentialNumber} · {trip.originSite.name} → {trip.destinationSite.name}
                </span>
                <StatusBadge status={trip.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
