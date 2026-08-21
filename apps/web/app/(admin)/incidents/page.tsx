"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiClient, ApiError } from "@/lib/api-client";
import type { Incident, PaginatedResult } from "@/lib/api-types";

const TYPE_LABEL: Record<string, string> = {
  MECHANICAL_FAILURE: "Falla mecanica",
  TRAFFIC_ACCIDENT: "Accidente de transito",
  DELAY: "Demora",
  WEATHER: "Clima",
  SECURITY: "Seguridad",
  CARGO_ISSUE: "Problema de carga",
  ROAD_CLOSURE: "Via cerrada",
  OTHER: "Otro",
};

const SEVERITY_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary" | "info"> = {
  LOW: "secondary",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "destructive",
};

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1").replace(/\/api\/v1\/?$/, "");

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierta",
  IN_PROGRESS: "En progreso",
  RESOLVED: "Resuelta",
  DISMISSED: "Descartada",
};

export default function IncidentsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [selected, setSelected] = useState<Incident | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["incidents", statusFilter, severityFilter],
    queryFn: () =>
      apiClient.get<PaginatedResult<Incident>>(
        `/incidents?pageSize=50${statusFilter ? `&status=${statusFilter}` : ""}${severityFilter ? `&severity=${severityFilter}` : ""}`,
      ),
    refetchInterval: 15_000,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "IN_PROGRESS" | "RESOLVED" | "DISMISSED" }) =>
      apiClient.patch<Incident>(`/incidents/${id}/status`, { status, resolutionNotes: resolutionNotes || undefined }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setSelected(updated);
      setResolutionNotes("");
      setActionError(null);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.response.message : "No se pudo actualizar la novedad.");
    },
  });

  const incidents = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novedades</h1>
        <p className="text-sm text-muted-foreground">Incidentes reportados por conductores y despachadores.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter || "ALL"} onValueChange={(v) => setSeverityFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas las severidades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las severidades</SelectItem>
            <SelectItem value="LOW">Baja</SelectItem>
            <SelectItem value="MEDIUM">Media</SelectItem>
            <SelectItem value="HIGH">Alta</SelectItem>
            <SelectItem value="CRITICAL">Critica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={AlertTriangle} title="Sin novedades" description="Las novedades reportadas apareceran aqui." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Severidad</TableHead>
                <TableHead>Conductor</TableHead>
                <TableHead>Viaje</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.map((incident) => (
                <TableRow key={incident.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(incident.reportedAt).toLocaleString("es-CO")}
                  </TableCell>
                  <TableCell className="font-medium">{TYPE_LABEL[incident.type]}</TableCell>
                  <TableCell>
                    <Badge variant={SEVERITY_VARIANT[incident.severity]}>{incident.severity}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {incident.driver.firstName} {incident.driver.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {incident.trip ? `#${incident.trip.sequentialNumber}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={incident.status === "OPEN" ? "warning" : incident.status === "RESOLVED" ? "success" : "secondary"}>
                      {STATUS_LABEL[incident.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelected(incident);
                        setResolutionNotes("");
                        setActionError(null);
                      }}
                    >
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected && TYPE_LABEL[selected.type]}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={SEVERITY_VARIANT[selected.severity]}>{selected.severity}</Badge>
                <Badge variant={selected.status === "OPEN" ? "warning" : selected.status === "RESOLVED" ? "success" : "secondary"}>
                  {STATUS_LABEL[selected.status]}
                </Badge>
              </div>
              <p className="text-sm">{selected.description}</p>
              <p className="text-xs text-muted-foreground">
                {selected.driver.firstName} {selected.driver.lastName} · {selected.driver.documentNumber}
                {selected.vehicle && ` · ${selected.vehicle.plate}`}
                {selected.trip && ` · Viaje #${selected.trip.sequentialNumber}`}
              </p>
              {selected.latitude && selected.longitude && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                </p>
              )}

              {selected.evidences.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selected.evidences.map((evidence) => (
                    <a
                      key={evidence.id}
                      href={`${API_ORIGIN}${evidence.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border border-border"
                    >
                      {evidence.type === "PHOTO" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`${API_ORIGIN}${evidence.fileUrl}`} alt={evidence.fileName} className="h-20 w-full object-cover" />
                      ) : (
                        <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
                          {evidence.fileName}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}

              {selected.resolutionNotes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notas de resolucion</p>
                  <p className="text-sm">{selected.resolutionNotes}</p>
                </div>
              )}

              {(selected.status === "OPEN" || selected.status === "IN_PROGRESS") && (
                <div className="space-y-1.5">
                  <Label htmlFor="resolution-notes">Notas (opcional)</Label>
                  <Textarea id="resolution-notes" value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} />
                </div>
              )}

              {actionError && <p className="text-sm text-destructive">{actionError}</p>}

              {(selected.status === "OPEN" || selected.status === "IN_PROGRESS") && (
                <DialogFooter>
                  {selected.status === "OPEN" && (
                    <Button
                      variant="outline"
                      disabled={resolveMutation.isPending}
                      onClick={() => resolveMutation.mutate({ id: selected.id, status: "IN_PROGRESS" })}
                    >
                      Marcar en progreso
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate({ id: selected.id, status: "DISMISSED" })}
                  >
                    Descartar
                  </Button>
                  <Button
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate({ id: selected.id, status: "RESOLVED" })}
                  >
                    {resolveMutation.isPending ? "Guardando..." : "Resolver"}
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
