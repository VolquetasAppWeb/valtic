"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Ban, CircleSlash, MapPin, Receipt, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/status-badge";
import { apiClient, ApiError } from "@/lib/api-client";
import type { Trip } from "@/lib/api-types";

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Viaje creado y asignado",
  ASSIGNED: "Asignado",
  ACCEPTED: "Aceptado por el conductor",
  STARTED_TO_LOAD: "Inicio hacia cargue",
  ARRIVED_AT_LOAD: "Llegada al punto de cargue",
  LOADING_CONFIRMED: "Cargue confirmado",
  DEPARTED_TO_UNLOAD: "Salida hacia descargue",
  ARRIVED_AT_UNLOAD: "Llegada al punto de descargue",
  QR_SCANNED: "Codigo QR escaneado",
  VALIDATION_PASSED: "Validacion aprobada",
  VALIDATION_FAILED: "Validacion fallida",
  COMPLETED: "Viaje completado",
  CANCELLED: "Viaje cancelado",
  MANUALLY_CLOSED: "Cierre manual",
  INCIDENT_REPORTED: "Novedad reportada",
  INCIDENT_RESOLVED: "Novedad resuelta",
  REVIEWED_APPROVED: "Revision aprobada",
  REVIEWED_REJECTED: "Revision rechazada",
  INCLUDED_IN_SETTLEMENT: "Incluido en liquidacion",
  SETTLED: "Liquidado",
  COMPENSATION: "Evento de correccion",
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1").replace(/\/api\/v1\/?$/, "");

const UNIT_LABEL: Record<string, string> = { TON: "ton", CUBIC_METER: "m3" };

export default function TripDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: trip, isLoading } = useQuery({
    queryKey: ["trips", params.id],
    queryFn: () => apiClient.get<Trip>(`/trips/${params.id}`),
    refetchInterval: 10_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (reasonValue: string) => apiClient.patch<Trip>(`/trips/${params.id}/cancel`, { reason: reasonValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      setCancelOpen(false);
      setReason("");
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.response.message : "No se pudo cancelar el viaje.");
    },
  });

  const closeMutation = useMutation({
    mutationFn: (reasonValue: string) => apiClient.patch<Trip>(`/trips/${params.id}/manual-close`, { reason: reasonValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      setCloseOpen(false);
      setReason("");
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.response.message : "No se pudo cerrar el viaje.");
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (decision: "APPROVE" | "REJECT") =>
      apiClient.patch<Trip>(`/trips/${params.id}/review`, { decision, notes: reviewNotes || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      setReviewOpen(false);
      setReviewNotes("");
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.response.message : "No se pudo registrar la revision.");
    },
  });

  if (isLoading || !trip) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const terminalStatuses = ["SETTLED", "CANCELLED", "MANUALLY_CLOSED", "REJECTED", "INCLUDED_IN_SETTLEMENT"];
  const canAct = !terminalStatuses.includes(trip.status);
  const isUnderReview = trip.status === "UNDER_REVIEW";
  const lastValidationFailed = trip.events?.filter((e) => e.type === "VALIDATION_FAILED").slice(-1)[0];
  const validationReasons = (lastValidationFailed?.payload?.reasons as string[] | undefined) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/trips")} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Viaje #{trip.sequentialNumber}</h1>
            <p className="text-sm text-muted-foreground">{trip.project.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={trip.status} />
          {isUnderReview && (
            <Button size="sm" onClick={() => { setActionError(null); setReviewOpen(true); }}>
              <ShieldQuestion className="h-4 w-4" />
              Revisar
            </Button>
          )}
          {canAct && (
            <>
              <Button variant="outline" size="sm" onClick={() => { setActionError(null); setCloseOpen(true); }}>
                <CircleSlash className="h-4 w-4" />
                Cierre manual
              </Button>
              <Button variant="destructive" size="sm" onClick={() => { setActionError(null); setCancelOpen(true); }}>
                <Ban className="h-4 w-4" />
                Cancelar
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalle</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Conductor</p>
              <p className="font-medium">{trip.driver.firstName} {trip.driver.lastName}</p>
              <p className="text-xs text-muted-foreground">{trip.driver.documentNumber} · {trip.driver.phone}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Vehiculo</p>
              <p className="font-medium">{trip.vehicle.plate}</p>
              <p className="text-xs text-muted-foreground">{trip.vehicle.capacity} {trip.vehicle.capacityUnit}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Propietario</p>
              <p className="font-medium">{trip.fleetOwner.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Material</p>
              <p className="font-medium">{trip.material.name}</p>
            </div>
            <div className="col-span-2 flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium">{trip.originSite.name} → {trip.destinationSite.name}</p>
                <p className="text-xs text-muted-foreground">
                  {trip.originSite.address} → {trip.destinationSite.address}
                </p>
              </div>
            </div>
            {trip.rateSnapshot && (
              <div>
                <p className="text-muted-foreground">Tarifa (snapshot al crear)</p>
                <p className="font-medium">
                  {new Intl.NumberFormat("es-CO", { style: "currency", currency: trip.rateSnapshot.currency, maximumFractionDigits: 0 }).format(Number(trip.rateSnapshot.value))}
                  {" "}({trip.rateSnapshot.rateType})
                </p>
              </div>
            )}
            {trip.voucherImageUrl && (
              <div className="col-span-2 rounded-md border border-border p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Receipt className="h-3.5 w-3.5" />
                  Foto del vale
                </p>
                <div className="flex flex-wrap items-start gap-4">
                  <a href={`${API_ORIGIN}${trip.voucherImageUrl}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${API_ORIGIN}${trip.voucherImageUrl}`}
                      alt="Vale del viaje"
                      className="h-28 w-28 rounded-md border border-border object-cover"
                    />
                  </a>
                  <div className="space-y-1 text-sm">
                    {trip.voucherNumber && (
                      <p>
                        <span className="text-muted-foreground">No. vale: </span>
                        {trip.voucherNumber}
                      </p>
                    )}
                    <p>
                      <span className="text-muted-foreground">Cantidad leida (OCR): </span>
                      {trip.voucherExtractedQuantity
                        ? `${Number(trip.voucherExtractedQuantity).toLocaleString("es-CO")} ${UNIT_LABEL[trip.voucherExtractedUnit ?? ""] ?? ""}`
                        : "No se pudo leer una cantidad"}
                    </p>
                    {(() => {
                      const registered = Number(trip.actualQuantity ?? trip.estimatedQuantity ?? 0);
                      const extracted = trip.voucherExtractedQuantity ? Number(trip.voucherExtractedQuantity) : null;
                      if (!registered || extracted == null) return null;
                      const diffRatio = Math.abs(extracted - registered) / registered;
                      if (diffRatio <= 0.1) {
                        return <p className="text-xs text-success">Coincide con la cantidad registrada del viaje.</p>;
                      }
                      return (
                        <p className="flex items-center gap-1 text-xs text-warning">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          No coincide con la cantidad registrada ({registered.toLocaleString("es-CO")}{" "}
                          {UNIT_LABEL[trip.quantityUnit ?? ""] ?? ""}) — revisar.
                        </p>
                      );
                    })()}
                    <p className="text-xs text-muted-foreground">
                      Foto tomada{" "}
                      {trip.voucherCapturedAt && dateTimeFormatter.format(new Date(trip.voucherCapturedAt))}
                      {trip.voucherLatitude != null && trip.voucherLongitude != null && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={`https://www.google.com/maps?q=${trip.voucherLatitude},${trip.voucherLongitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            ver ubicacion
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {trip.voucherExtractedFields && Object.keys(trip.voucherExtractedFields).length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 border-t border-border pt-3 text-sm sm:grid-cols-2">
                    {Object.entries(trip.voucherExtractedFields).map(([label, value]) => (
                      <p key={label}>
                        <span className="text-muted-foreground">{label}: </span>
                        {value}
                      </p>
                    ))}
                  </div>
                )}
                {(() => {
                  const platePlain = trip.voucherExtractedFields?.["Placa"];
                  if (!platePlain) return null;
                  const normalize = (v: string) => v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                  if (normalize(platePlain) === normalize(trip.vehicle.plate)) return null;
                  return (
                    <p className="mt-2 flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      La placa del vale ({platePlain}) no coincide con la del vehiculo del viaje (
                      {trip.vehicle.plate}) — revisar.
                    </p>
                  );
                })()}
              </div>
            )}
            {trip.cancellationReason && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Motivo de cancelacion</p>
                <p className="font-medium">{trip.cancellationReason}</p>
              </div>
            )}
            {isUnderReview && validationReasons.length > 0 && (
              <div className="col-span-2 rounded-md border border-warning/40 bg-warning/10 p-3">
                <p className="text-xs font-medium text-warning">Motivo por el que quedo en revision</p>
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {validationReasons.map((reasonText) => (
                    <li key={reasonText}>{reasonText}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linea de tiempo</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {trip.events?.map((event) => (
                <li key={event.id} className="border-l-2 border-border pl-4">
                  <p className="text-sm font-medium">{EVENT_LABEL[event.type] ?? event.type}</p>
                  <p className="text-xs text-muted-foreground">{dateTimeFormatter.format(new Date(event.occurredAt))}</p>
                </li>
              ))}
              {(!trip.events || trip.events.length === 0) && (
                <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
              )}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar viaje</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">Motivo (obligatorio)</Label>
              <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={reason.trim().length < 5 || cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(reason)}
              >
                {cancelMutation.isPending ? "Cancelando..." : "Confirmar cancelacion"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cierre manual del viaje</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Usa esta accion solo cuando el viaje no pueda cerrarse por el flujo normal (ej. perdida de senal del
              conductor). Queda registrado en la auditoria.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="close-reason">Motivo (obligatorio)</Label>
              <Textarea id="close-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            <DialogFooter>
              <Button
                disabled={reason.trim().length < 5 || closeMutation.isPending}
                onClick={() => closeMutation.mutate(reason)}
              >
                {closeMutation.isPending ? "Cerrando..." : "Confirmar cierre manual"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revisar viaje</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {validationReasons.length > 0 && (
              <ul className="list-inside list-disc rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                {validationReasons.map((reasonText) => (
                  <li key={reasonText}>{reasonText}</li>
                ))}
              </ul>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="review-notes">Notas (opcional)</Label>
              <Textarea id="review-notes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
            </div>
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate("REJECT")}
              >
                Rechazar
              </Button>
              <Button disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate("APPROVE")}>
                {reviewMutation.isPending ? "Guardando..." : "Aprobar"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
