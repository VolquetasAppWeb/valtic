"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient, ApiError } from "@/lib/api-client";
import type { AuditEvent, PaginatedResult } from "@/lib/api-types";

const ACTOR_KIND_LABEL: Record<string, string> = {
  USER: "Admin/Despachador",
  DRIVER: "Conductor",
  SYSTEM: "Sistema",
};

export default function AuditPage(): JSX.Element {
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actorKind, setActorKind] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    entityType: "",
    action: "",
    actorKind: "",
    dateFrom: "",
    dateTo: "",
  });
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const params = new URLSearchParams({ pageSize: "50" });
  if (appliedFilters.entityType) params.set("entityType", appliedFilters.entityType);
  if (appliedFilters.action) params.set("action", appliedFilters.action);
  if (appliedFilters.actorKind) params.set("actorKind", appliedFilters.actorKind);
  if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
  if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit", appliedFilters],
    queryFn: () => apiClient.get<PaginatedResult<AuditEvent>>(`/audit?${params.toString()}`),
    refetchInterval: 15_000,
  });

  const events = data?.data ?? [];
  const errorMessage = error instanceof ApiError ? error.response.message : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Historial permanente de acciones de administradores, despachadores y conductores: quien hizo que, cuando y
          desde donde. Este registro no se puede eliminar.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="entityType">Entidad</Label>
          <Input id="entityType" placeholder="Trip, Settlement, User..." value={entityType} onChange={(e) => setEntityType(e.target.value)} className="w-48" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="action">Accion</Label>
          <Input id="action" placeholder="AUTH_LOGIN_FAILED..." value={action} onChange={(e) => setAction(e.target.value)} className="w-48" />
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de actor</Label>
          <Select value={actorKind || "ALL"} onValueChange={(v) => setActorKind(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="USER">Admin/Despachador</SelectItem>
              <SelectItem value="DRIVER">Conductor</SelectItem>
              <SelectItem value="SYSTEM">Sistema</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateFrom">Desde</Label>
          <Input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateTo">Hasta</Label>
          <Input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <Button
          variant="outline"
          onClick={() => setAppliedFilters({ entityType, action, actorKind, dateFrom, dateTo })}
        >
          Filtrar
        </Button>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : errorMessage ? (
          <div className="p-6">
            <EmptyState icon={ShieldCheck} title="No se pudo cargar la auditoria" description={errorMessage} />
          </div>
        ) : events.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={ShieldCheck} title="Sin eventos" description="No hay eventos de auditoria con estos filtros." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Accion</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="text-muted-foreground">{new Date(event.createdAt).toLocaleString("es-CO")}</TableCell>
                  <TableCell className="font-medium">{event.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {event.entityType} · {event.entityId.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {event.actor
                      ? `${event.actor.firstName} ${event.actor.lastName}`
                      : event.actorDriver
                        ? `${event.actorDriver.firstName} ${event.actorDriver.lastName} (conductor)`
                        : "Sistema"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{event.ipAddress ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(event)}>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.action}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {new Date(selected.createdAt).toLocaleString("es-CO")} ·{" "}
                {selected.actor
                  ? `${selected.actor.firstName} ${selected.actor.lastName} (${selected.actor.email})`
                  : selected.actorDriver
                    ? `${selected.actorDriver.firstName} ${selected.actorDriver.lastName} · conductor · doc. ${selected.actorDriver.documentNumber}`
                    : "Sistema"}
                {selected.tenant && ` · ${selected.tenant.name}`}
              </p>
              <p>
                <span className="text-muted-foreground">Entidad:</span> {selected.entityType} / {selected.entityId}
              </p>
              {selected.reason && (
                <p>
                  <span className="text-muted-foreground">Motivo:</span> {selected.reason}
                </p>
              )}
              {selected.ipAddress && (
                <p>
                  <span className="text-muted-foreground">IP:</span> {selected.ipAddress}
                </p>
              )}
              {selected.userAgent && (
                <p className="break-all">
                  <span className="text-muted-foreground">User agent:</span> {selected.userAgent}
                </p>
              )}
              {selected.oldValue != null && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Valor anterior</p>
                  <pre className="overflow-x-auto rounded-md border border-border bg-secondary/40 p-3 text-xs">
                    {JSON.stringify(selected.oldValue, null, 2)}
                  </pre>
                </div>
              )}
              {selected.newValue != null && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Valor nuevo</p>
                  <pre className="overflow-x-auto rounded-md border border-border bg-secondary/40 p-3 text-xs">
                    {JSON.stringify(selected.newValue, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
