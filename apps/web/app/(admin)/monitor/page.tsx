"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon, Radar, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/status-badge";
import { apiClient } from "@/lib/api-client";
import { useIsMobile } from "@/hooks/use-media-query";
import type { LocationPoint, Trip } from "@/lib/api-types";

const POLL_INTERVAL_MS = 15_000;

const TripMap = dynamic(() => import("@/components/admin/trip-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("es-CO", { numeric: "auto" });

function relativeTime(dateIso: string): string {
  const diffSeconds = Math.round((new Date(dateIso).getTime() - Date.now()) / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return relativeTimeFormatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  return relativeTimeFormatter.format(diffHours, "hour");
}

export default function MonitorPage(): JSX.Element {
  const [mapTrip, setMapTrip] = useState<Trip | null>(null);
  const isMobile = useIsMobile();

  const { data: trips, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["trips", "active"],
    queryFn: () => apiClient.get<Trip[]>("/trips/active"),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: locations, isLoading: loadingLocations } = useQuery({
    queryKey: ["locations", mapTrip?.id],
    queryFn: () => apiClient.get<LocationPoint[]>(`/locations/trip/${mapTrip?.id}`),
    enabled: !!mapTrip,
    refetchInterval: mapTrip ? POLL_INTERVAL_MS : false,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monitor en vivo</h1>
          <p className="text-sm text-muted-foreground">
            Viajes activos, actualizado cada {POLL_INTERVAL_MS / 1000} segundos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <p className="text-xs text-muted-foreground">Ultima actualizacion: {relativeTime(new Date(dataUpdatedAt).toISOString())}</p>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !trips || trips.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Radar} title="Sin viajes activos" description="Los viajes en curso apareceran aqui automaticamente." />
          </div>
        ) : isMobile ? (
          <div className="divide-y divide-border">
            {trips.map((trip) => (
              <div key={trip.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-lg font-bold">#{trip.sequentialNumber}</p>
                  <StatusBadge status={trip.status} />
                </div>
                <p className="text-sm text-muted-foreground">{trip.project.name}</p>
                <p className="text-sm text-muted-foreground">
                  Conductor: {trip.driver.firstName} {trip.driver.lastName}
                </p>
                <p className="text-sm text-muted-foreground">Vehiculo: {trip.vehicle.plate}</p>
                <p className="text-sm text-muted-foreground">
                  Ultima actualizacion: {trip.assignedAt ? relativeTime(trip.assignedAt) : "—"}
                </p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setMapTrip(trip)}>
                    <MapIcon className="h-4 w-4" />
                    Mapa
                  </Button>
                  <Button variant="outline" className="flex-1" asChild>
                    <Link href={`/trips/${trip.id}`}>Ver detalle</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Conductor</TableHead>
                <TableHead>Vehiculo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Ultima actualizacion</TableHead>
                <TableHead className="text-right">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell className="font-medium">#{trip.sequentialNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{trip.project.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {trip.driver.firstName} {trip.driver.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{trip.vehicle.plate}</TableCell>
                  <TableCell>
                    <StatusBadge status={trip.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {trip.assignedAt ? relativeTime(trip.assignedAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setMapTrip(trip)}>
                        <MapIcon className="h-4 w-4" />
                        Mapa
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/trips/${trip.id}`}>Ver</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!mapTrip} onOpenChange={(open) => !open && setMapTrip(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{mapTrip && `Recorrido GPS — Viaje #${mapTrip.sequentialNumber}`}</DialogTitle>
          </DialogHeader>
          <div className="h-[420px] w-full overflow-hidden rounded-md border border-border">
            {loadingLocations ? (
              <Skeleton className="h-full w-full" />
            ) : !locations || locations.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon={Radar}
                  title="Sin puntos GPS"
                  description="La app del conductor aun no ha reportado ubicaciones para este viaje."
                />
              </div>
            ) : (
              <TripMap points={locations} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
