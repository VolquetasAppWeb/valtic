"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Eye, Plus, Wallet } from "lucide-react";
import { PERMISSIONS } from "@valtic/types";
import {
  settlementPeriodSchema,
  type SettlementPeriodInput,
  createAdjustmentSchema,
  type CreateAdjustmentInput,
} from "@valtic/validation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { FleetOwner, PaginatedResult, Settlement, SettlementPreview } from "@/lib/api-types";

const ADJUSTMENT_TYPE_LABEL: Record<string, string> = {
  BONUS: "Bono",
  DEDUCTION: "Descuento",
  CORRECTION: "Correccion",
};

const RATE_TYPE_LABEL: Record<string, string> = {
  PER_TRIP: "Por viaje",
  PER_TON: "Por tonelada",
  PER_CUBIC_METER: "Por m3",
  PER_KILOMETER: "Por kilometro",
  FIXED: "Fija",
};

function currencyFor(currency: string) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 });
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Presets de periodo para no tener que escribir las fechas a mano cada vez;
// siempre relativos a hoy. El usuario puede seguir ajustando las fechas
// manualmente despues de elegir un preset.
const PERIOD_PRESETS: Array<{ value: string; label: string; range: () => [Date, Date] }> = [
  { value: "TODAY", label: "Hoy", range: () => [new Date(), new Date()] },
  {
    value: "WEEK",
    label: "Esta semana (ultimos 7 dias)",
    range: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return [start, end];
    },
  },
  {
    value: "MONTH",
    label: "Este mes",
    range: () => {
      const end = new Date();
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      return [start, end];
    },
  },
  ...Array.from({ length: 11 }, (_, i) => i + 1).map((n) => ({
    value: `MONTHS_${n}`,
    label: `Ultimos ${n} ${n === 1 ? "mes" : "meses"}`,
    range: (): [Date, Date] => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - n);
      return [start, end];
    },
  })),
  {
    value: "YEAR",
    label: "Este año",
    range: () => {
      const end = new Date();
      const start = new Date(end.getFullYear(), 0, 1);
      return [start, end];
    },
  },
];

export default function SettlementsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const canApprove = permissions.includes(PERMISSIONS.SETTLEMENTS_APPROVE);
  const canManage = permissions.includes(PERMISSIONS.SETTLEMENTS_MANAGE);
  // Un dispatcher puede generar liquidaciones (solo de sus propios
  // propietarios, filtrado por el backend), pero no ajustar/aprobar/cancelar
  // — eso sigue siendo exclusivo de canManage.
  const canCreate = canManage || permissions.includes(PERMISSIONS.SETTLEMENTS_CREATE_OWN);

  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["settlements", statusFilter],
    queryFn: () =>
      apiClient.get<PaginatedResult<Settlement>>(`/settlements?pageSize=50${statusFilter ? `&status=${statusFilter}` : ""}`),
    refetchInterval: 15_000,
  });

  const { data: ownersData } = useQuery({
    queryKey: ["fleet-owners", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<FleetOwner>>("/fleet-owners?pageSize=100"),
  });

  const { data: selected } = useQuery({
    queryKey: ["settlements", "detail", selectedId],
    queryFn: () => apiClient.get<Settlement>(`/settlements/${selectedId}`),
    enabled: !!selectedId,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SettlementPeriodInput>({ resolver: zodResolver(settlementPeriodSchema) });

  function openCreate(): void {
    setPreview(null);
    setPreviewError(null);
    reset({ fleetOwnerId: "", periodStart: "", periodEnd: "" });
    setCreateOpen(true);
  }

  const previewMutation = useMutation({
    mutationFn: (values: SettlementPeriodInput) =>
      apiClient.get<SettlementPreview>(
        `/settlements/preview?fleetOwnerId=${values.fleetOwnerId}&periodStart=${values.periodStart}&periodEnd=${values.periodEnd}`,
      ),
    onSuccess: (result) => {
      setPreview(result);
      setPreviewError(null);
    },
    onError: (error: unknown) => {
      setPreview(null);
      setPreviewError(error instanceof ApiError ? error.response.message : "No se pudo generar la previsualizacion.");
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: SettlementPeriodInput) => apiClient.post<Settlement>("/settlements", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlements"] });
      setCreateOpen(false);
    },
    onError: (error: unknown) => {
      setPreviewError(error instanceof ApiError ? error.response.message : "No se pudo crear la liquidacion.");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch<Settlement>(`/settlements/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlements"] });
      setActionError(null);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.response.message : "No se pudo aprobar la liquidacion.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch<Settlement>(`/settlements/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlements"] });
      setActionError(null);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.response.message : "No se pudo cancelar la liquidacion.");
    },
  });

  const {
    register: registerAdjustment,
    handleSubmit: handleAdjustmentSubmit,
    reset: resetAdjustment,
    watch: watchAdjustment,
    setValue: setAdjustmentValue,
    formState: { errors: adjustmentErrors },
  } = useForm<CreateAdjustmentInput>({ resolver: zodResolver(createAdjustmentSchema) });

  const adjustmentMutation = useMutation({
    mutationFn: (values: CreateAdjustmentInput) => {
      if (!selectedId) throw new Error("Sin liquidacion seleccionada");
      return apiClient.post<Settlement>(`/settlements/${selectedId}/adjustments`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlements", "detail", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["settlements"] });
      setAdjustmentOpen(false);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.response.message : "No se pudo agregar el ajuste.");
    },
  });

  async function handleExport(format: "pdf" | "excel"): Promise<void> {
    if (!selected) return;
    setActionError(null);
    try {
      const ext = format === "pdf" ? "pdf" : "xlsx";
      await apiClient.download(`/settlements/${selected.id}/export/${format}`, `liquidacion-${selected.sequentialNumber}.${ext}`);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.response.message : "No se pudo descargar el archivo.");
    }
  }

  const settlements = data?.data ?? [];
  const owners = ownersData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Liquidaciones</h1>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "Liquidaciones de viajes completados por propietario de flota y periodo."
              : canCreate
                ? "Genera liquidaciones de tus propios propietarios asignados."
                : "Tus liquidaciones (generadas por el administrador)."}
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nueva liquidacion
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            <SelectItem value="DRAFT">Borrador</SelectItem>
            <SelectItem value="APPROVED">Aprobada</SelectItem>
            <SelectItem value="PAID">Pagada</SelectItem>
            <SelectItem value="CANCELLED">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : settlements.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Wallet} title="Sin liquidaciones" description="Genera una liquidacion a partir de viajes completados." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Propietario</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead>Subtotal</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((settlement) => (
                <TableRow key={settlement.id}>
                  <TableCell className="font-medium">{settlement.sequentialNumber}</TableCell>
                  <TableCell>{settlement.fleetOwner.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {settlement.periodStart.slice(0, 10)} - {settlement.periodEnd.slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {currencyFor(settlement.currency).format(Number(settlement.subtotal))}
                  </TableCell>
                  <TableCell className="font-medium">{currencyFor(settlement.currency).format(Number(settlement.total))}</TableCell>
                  <TableCell>
                    <StatusBadge status={settlement.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedId(settlement.id);
                        setActionError(null);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nueva liquidacion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Propietario</Label>
              <Select value={watch("fleetOwnerId")} onValueChange={(value) => setValue("fleetOwnerId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un propietario" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.fleetOwnerId && <p className="text-xs text-destructive">{errors.fleetOwnerId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Periodo rapido</Label>
              <Select
                onValueChange={(value) => {
                  const preset = PERIOD_PRESETS.find((p) => p.value === value);
                  if (!preset) return;
                  const [start, end] = preset.range();
                  setValue("periodStart", toDateInput(start));
                  setValue("periodEnd", toDateInput(end));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elige un periodo (opcional, tambien puedes escribir las fechas)" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="periodStart">Desde</Label>
                <Input id="periodStart" type="date" {...register("periodStart")} />
                {errors.periodStart && <p className="text-xs text-destructive">{errors.periodStart.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="periodEnd">Hasta</Label>
                <Input id="periodEnd" type="date" {...register("periodEnd")} />
                {errors.periodEnd && <p className="text-xs text-destructive">{errors.periodEnd.message}</p>}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={previewMutation.isPending}
              onClick={handleSubmit((values) => previewMutation.mutate(values))}
            >
              {previewMutation.isPending ? "Calculando..." : "Previsualizar"}
            </Button>

            {previewError && <p className="text-sm text-destructive">{previewError}</p>}

            {preview && (
              <div className="space-y-3 rounded-md border border-border p-4">
                <p className="text-sm text-muted-foreground">
                  {preview.tripCount} viaje(s) elegible(s) para {preview.fleetOwner.name}
                </p>
                {preview.trips.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Viaje</TableHead>
                        <TableHead>Ruta</TableHead>
                        <TableHead>Tarifa</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.trips.map((trip) => (
                        <TableRow key={trip.id}>
                          <TableCell>#{trip.sequentialNumber}</TableCell>
                          <TableCell className="text-muted-foreground">{trip.route}</TableCell>
                          <TableCell className="text-muted-foreground">{RATE_TYPE_LABEL[trip.item.rateType]}</TableCell>
                          <TableCell className="text-right">{trip.item.total.toLocaleString("es-CO")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <p className="text-right text-sm font-semibold">Subtotal: {preview.subtotal.toLocaleString("es-CO")}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={!preview || preview.tripCount === 0 || createMutation.isPending}
              onClick={handleSubmit((values) => createMutation.mutate(values))}
            >
              {createMutation.isPending ? "Creando..." : "Crear liquidacion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selected ? `Liquidacion #${selected.sequentialNumber} — ${selected.fleetOwner.name}` : "Liquidacion"}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selected.status} />
                <span className="text-xs text-muted-foreground">
                  {selected.periodStart.slice(0, 10)} - {selected.periodEnd.slice(0, 10)}
                </span>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Viajes ({selected.items.length})</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Viaje</TableHead>
                      <TableHead>Ruta</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Tarifa</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>#{item.trip.sequentialNumber}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.trip.originSite.name} → {item.trip.destinationSite.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.trip.material.name}</TableCell>
                        <TableCell className="text-muted-foreground">{RATE_TYPE_LABEL[item.rateType]}</TableCell>
                        <TableCell className="text-right">{Number(item.total).toLocaleString("es-CO")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Ajustes ({selected.adjustments.length})</p>
                {canManage && selected.status === "DRAFT" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      resetAdjustment({ type: "BONUS", description: "", amount: 0 });
                      setAdjustmentOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Agregar ajuste
                  </Button>
                )}
              </div>
              {selected.adjustments.length > 0 && (
                <div className="space-y-1">
                  {selected.adjustments.map((adj) => (
                    <div key={adj.id} className="flex items-center justify-between text-sm">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={adj.type === "DEDUCTION" ? "destructive" : "secondary"}>
                          {ADJUSTMENT_TYPE_LABEL[adj.type]}
                        </Badge>
                        {adj.description}
                      </span>
                      <span>{Number(adj.amount).toLocaleString("es-CO")}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1 border-t border-border pt-3 text-right text-sm">
                <p className="text-muted-foreground">
                  Subtotal: {currencyFor(selected.currency).format(Number(selected.subtotal))}
                </p>
                <p className="text-muted-foreground">
                  Ajustes: {currencyFor(selected.currency).format(Number(selected.adjustmentsTotal))}
                </p>
                <p className="text-base font-semibold">Total: {currencyFor(selected.currency).format(Number(selected.total))}</p>
              </div>

              {actionError && <p className="text-sm text-destructive">{actionError}</p>}

              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" onClick={() => handleExport("pdf")}>
                  <Download className="h-4 w-4" />
                  PDF
                </Button>
                <Button variant="outline" onClick={() => handleExport("excel")}>
                  <Download className="h-4 w-4" />
                  Excel
                </Button>
                {canManage && selected.status === "DRAFT" && (
                  <>
                    <Button
                      variant="destructive"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(selected.id)}
                    >
                      Cancelar
                    </Button>
                    {canApprove && (
                      <Button disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(selected.id)}>
                        {approveMutation.isPending ? "Aprobando..." : "Aprobar"}
                      </Button>
                    )}
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar ajuste</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleAdjustmentSubmit((values) => adjustmentMutation.mutate(values))}>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={watchAdjustment("type")}
                onValueChange={(value) => setAdjustmentValue("type", value as CreateAdjustmentInput["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ADJUSTMENT_TYPE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Descripcion</Label>
              <Input id="description" {...registerAdjustment("description")} />
              {adjustmentErrors.description && (
                <p className="text-xs text-destructive">{adjustmentErrors.description.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Monto</Label>
              <Input id="amount" type="number" step="1" {...registerAdjustment("amount")} />
              {adjustmentErrors.amount && <p className="text-xs text-destructive">{adjustmentErrors.amount.message}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={adjustmentMutation.isPending}>
                {adjustmentMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
