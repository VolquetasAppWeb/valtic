"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, MapPin, MapPinOff, Satellite, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Incident, IncidentSeverity, IncidentType } from "@/lib/api-types";
import { StatusBadge } from "@/components/admin/status-badge";
import { useDriverRuntimeStore } from "@/stores/driver-runtime-store";
import { useGpsTracking } from "@/lib/driver/gps-tracking";
import { queueDriverAction, getOrCreateDeviceId } from "@/lib/driver/actions";
import { getCurrentPosition } from "@/lib/driver/geolocation";
import { apiClient, ApiError } from "@/lib/api-client";
import type { DriverActionType } from "@/lib/driver/outbox";
import type { Trip, TripStatus } from "@/lib/api-types";

const MAIN_ACTION_BY_STATUS: Partial<Record<TripStatus, { label: string; action: DriverActionType }>> = {
  ASSIGNED: { label: "Aceptar viaje", action: "ACCEPT" },
  ACCEPTED: { label: "Iniciar viaje hacia cargue", action: "START_TO_LOAD" },
  EN_ROUTE_TO_LOAD: { label: "Confirmar llegada al cargue", action: "ARRIVE_LOAD" },
  LOADING: { label: "Confirmar cargue completado", action: "CONFIRM_LOADED" },
  LOADED: { label: "Iniciar ruta a descargue", action: "START_TO_UNLOAD" },
  EN_ROUTE_TO_UNLOAD: { label: "Confirmar llegada al descargue", action: "ARRIVE_UNLOAD" },
};

interface QrValidateResponse {
  outcome: "COMPLETED" | "UNDER_REVIEW";
  reasons: string[];
  distanceMeters: number;
  trip: Trip;
}

export default function DriverTripDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrOutcome, setQrOutcome] = useState<QrValidateResponse | null>(null);
  const [voucherPhoto, setVoucherPhoto] = useState<File | null>(null);
  const [voucherExtractedQuantity, setVoucherExtractedQuantity] = useState<string | null>(null);
  const [voucherExtractedUnit, setVoucherExtractedUnit] = useState<"TON" | "CUBIC_METER" | null>(null);
  const [voucherUploadError, setVoucherUploadError] = useState<string | null>(null);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [incidentType, setIncidentType] = useState<IncidentType>("DELAY");
  const [incidentSeverity, setIncidentSeverity] = useState<IncidentSeverity>("LOW");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [incidentPhoto, setIncidentPhoto] = useState<File | null>(null);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [incidentSuccess, setIncidentSuccess] = useState(false);

  const { data: trip, isLoading } = useQuery({
    queryKey: ["trips", "mine", params.id],
    queryFn: () => apiClient.get<Trip>(`/trips/${params.id}`),
    refetchInterval: 5_000,
  });

  const pendingCount = useDriverRuntimeStore((state) => state.pendingCount);
  const forcedOffline = useDriverRuntimeStore((state) => state.forcedOffline);
  const setForcedOffline = useDriverRuntimeStore((state) => state.setForcedOffline);

  const gps = useGpsTracking(trip?.id, trip?.status);

  interface RequestCloseCodeResponse {
    token: string;
    expiresAt: string;
  }

  const requestCodeMutation = useMutation({
    mutationFn: () => apiClient.post<RequestCloseCodeResponse>("/qr/request-close-code", { tripId: trip!.id }),
    onSuccess: (data) => {
      setConfirmationCode(data.token);
      setCodeError(null);
    },
    onError: (error: unknown) => {
      setCodeError(
        error instanceof ApiError ? error.response.message : "No se pudo generar tu codigo de confirmacion.",
      );
    },
  });

  const qrMutation = useMutation({
    mutationFn: async () => {
      const position = gps.lastPosition ?? (await getCurrentPosition().catch(() => null));
      const result = await apiClient.post<QrValidateResponse>("/qr/validate", {
        token: confirmationCode,
        tripId: trip!.id,
        deviceId: getOrCreateDeviceId(),
        latitude: position?.latitude ?? trip!.destinationSite.latitude,
        longitude: position?.longitude ?? trip!.destinationSite.longitude,
        accuracy: position?.accuracy ?? 9999,
        capturedAt: position?.capturedAt ?? new Date().toISOString(),
      });
      return { result, position };
    },
    onSuccess: async ({ result, position }) => {
      setQrOutcome(result);
      setQrError(null);
      queryClient.invalidateQueries({ queryKey: ["trips"] });

      if (voucherPhoto) {
        try {
          const formData = new FormData();
          formData.append("file", voucherPhoto);
          if (position) {
            formData.append("latitude", String(position.latitude));
            formData.append("longitude", String(position.longitude));
            formData.append("capturedAt", position.capturedAt);
          }
          const voucher = await apiClient.post<Trip>(`/trips/${trip!.id}/voucher`, formData);
          setVoucherExtractedQuantity(voucher.voucherExtractedQuantity);
          setVoucherExtractedUnit(voucher.voucherExtractedUnit);
          setVoucherUploadError(null);
        } catch (error) {
          setVoucherUploadError(
            error instanceof ApiError ? error.response.message : "No se pudo subir la foto del vale.",
          );
        }
      }
    },
    onError: (error: unknown) => {
      setQrError(error instanceof ApiError ? error.response.message : "No se pudo validar el codigo QR.");
    },
  });

  const incidentMutation = useMutation({
    mutationFn: async () => {
      const position = gps.lastPosition ?? (await getCurrentPosition().catch(() => null));
      const incident = await apiClient.post<Incident>("/incidents", {
        tripId: trip!.id,
        type: incidentType,
        severity: incidentSeverity,
        description: incidentDescription,
        latitude: position?.latitude,
        longitude: position?.longitude,
      });

      if (incidentPhoto) {
        const formData = new FormData();
        formData.append("file", incidentPhoto);
        await apiClient.post(`/incidents/${incident.id}/evidence`, formData);
      }

      return incident;
    },
    onSuccess: () => {
      setIncidentSuccess(true);
      setIncidentError(null);
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
    onError: (error: unknown) => {
      setIncidentError(error instanceof ApiError ? error.response.message : "No se pudo reportar la novedad.");
    },
  });

  function openIncidentDialog(): void {
    setIncidentType("DELAY");
    setIncidentSeverity("LOW");
    setIncidentDescription("");
    setIncidentPhoto(null);
    setIncidentError(null);
    setIncidentSuccess(false);
    setIncidentDialogOpen(true);
  }

  if (isLoading || !trip) {
    return <p className="text-center text-sm text-muted-foreground">Cargando viaje...</p>;
  }

  const mainAction = MAIN_ACTION_BY_STATUS[trip.status];
  const isAtUnloading = trip.status === "UNLOADING";

  async function handleMainAction(): Promise<void> {
    if (!mainAction) return;
    setIsSubmitting(true);
    try {
      await queueDriverAction(trip!.id, mainAction.action, gps.lastPosition);
    } finally {
      setIsSubmitting(false);
    }
  }

  function openQrDialog(): void {
    setConfirmationCode("");
    setCodeError(null);
    setQrError(null);
    setQrOutcome(null);
    setVoucherPhoto(null);
    setVoucherExtractedQuantity(null);
    setVoucherExtractedUnit(null);
    setVoucherUploadError(null);
    setQrDialogOpen(true);
    requestCodeMutation.mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/driver")} aria-label="Volver">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Viaje #{trip.sequentialNumber}</h1>
          <StatusBadge status={trip.status} />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <p className="font-medium">{trip.project.name}</p>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p>{trip.originSite.name}</p>
              <p className="text-xs text-muted-foreground">{trip.originSite.address}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p>{trip.destinationSite.name}</p>
              <p className="text-xs text-muted-foreground">{trip.destinationSite.address}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Vehiculo {trip.vehicle.plate} · Material {trip.material.name}
          </p>
        </CardContent>
      </Card>

      {mainAction && (
        <Button className="h-14 w-full text-base" disabled={isSubmitting} onClick={handleMainAction}>
          {isSubmitting ? "Registrando..." : mainAction.label}
        </Button>
      )}

      {isAtUnloading && (
        <Button className="h-14 w-full text-base" onClick={openQrDialog}>
          <CheckCircle2 className="h-5 w-5" />
          Confirmar cierre en descargue
        </Button>
      )}

      {!mainAction && !isAtUnloading && (
        <p className="text-center text-sm text-muted-foreground">
          Este viaje no tiene una accion pendiente para el conductor.
        </p>
      )}

      <Button variant="outline" className="w-full" onClick={openIncidentDialog}>
        <AlertTriangle className="h-4 w-4" />
        Reportar novedad
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            {gps.sharing ? (
              <Satellite className="h-4 w-4 text-success" />
            ) : (
              <MapPinOff className="h-4 w-4 text-muted-foreground" />
            )}
            Ubicacion GPS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {gps.sharing ? (
            <div className="flex items-center gap-2 text-xs text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Compartiendo tu ubicacion en tiempo real con el despachador
              {gps.lastPosition && ` · precision ${Math.round(gps.lastPosition.accuracy)}m`}
            </div>
          ) : gps.waitingForAccuracy ? (
            <div className="flex items-center gap-2 text-xs text-warning">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
              </span>
              Buscando señal GPS precisa
              {gps.lastPosition && ` (actual ~${Math.round(gps.lastPosition.accuracy)}m, se necesita 10m o menos)`}
            </div>
          ) : gps.error ? (
            <p className="text-xs text-destructive">{gps.error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              La ubicacion se comparte automaticamente mientras el viaje esta en curso (desde que lo aceptas hasta
              que llegas al punto de descargue), y se detiene apenas termina.
            </p>
          )}
          {pendingCount > 0 && (
            <p className="text-xs text-muted-foreground">{pendingCount} punto(s) pendientes de sincronizar.</p>
          )}
          <Button
            variant={forcedOffline ? "destructive" : "outline"}
            size="sm"
            className="w-full"
            onClick={() => setForcedOffline(!forcedOffline)}
          >
            <WifiOff className="h-4 w-4" />
            {forcedOffline ? "Reconectar" : "Simular sin conexion"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar cierre de viaje</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!qrOutcome ? (
              <>
                {requestCodeMutation.isPending ? (
                  <p className="text-sm text-muted-foreground">Generando tu codigo de confirmacion...</p>
                ) : codeError ? (
                  <div className="space-y-2">
                    <p className="text-sm text-destructive">{codeError}</p>
                    <Button variant="outline" size="sm" onClick={() => requestCodeMutation.mutate()}>
                      Reintentar
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-border bg-secondary/40 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Tu codigo de confirmacion</p>
                    <p className="font-mono text-sm font-semibold break-all">{confirmationCode}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ya quedo listo, no necesitas escribir nada. Solo confirma abajo estando en el punto de
                      descargue.
                    </p>
                  </div>
                )}
                <div className="flex items-start gap-3 rounded-md border-2 border-warning bg-warning/10 p-3">
                  <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
                  <div>
                    <p className="text-sm font-bold text-warning">Recuerda subir la foto del vale</p>
                    <p className="text-xs text-warning">
                      Antes de confirmar el cierre, toma o adjunta la foto del vale de despacho. Sin ella, el viaje
                      puede quedar sin respaldo para la liquidacion.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="voucher-photo">Foto del vale</Label>
                  <input
                    id="voucher-photo"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setVoucherPhoto(e.target.files?.[0] ?? null)}
                    className="w-full text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    El sistema intenta leer el valor automaticamente para que quede de referencia junto al viaje.
                  </p>
                </div>
                {qrError && <p className="text-sm text-destructive">{qrError}</p>}
                {!navigator.onLine && (
                  <p className="text-sm text-warning">Necesitas conexion a internet para confirmar el cierre.</p>
                )}
                <DialogFooter>
                  <Button
                    disabled={!confirmationCode || qrMutation.isPending}
                    onClick={() => qrMutation.mutate()}
                  >
                    {qrMutation.isPending ? "Confirmando..." : "Confirmar cierre"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="space-y-3 text-center">
                {qrOutcome.outcome === "COMPLETED" ? (
                  <>
                    <p className="text-base font-semibold text-success">Viaje completado</p>
                    <p className="text-xs text-muted-foreground">
                      Distancia al punto: {qrOutcome.distanceMeters}m. El cierre quedo registrado.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-semibold text-warning">Enviado a revision</p>
                    <p className="text-xs text-muted-foreground">
                      El QR es valido, pero la ubicacion no paso la validacion automatica:
                    </p>
                    <ul className="list-inside list-disc text-left text-xs text-muted-foreground">
                      {qrOutcome.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">Un administrador revisara el viaje manualmente.</p>
                  </>
                )}
                {voucherPhoto && (
                  <p className="text-xs text-muted-foreground">
                    {voucherUploadError
                      ? `Vale: ${voucherUploadError}`
                      : voucherExtractedQuantity
                        ? `Vale leido: ${Number(voucherExtractedQuantity).toLocaleString("es-CO")} ${voucherExtractedUnit === "TON" ? "ton" : "m3"}`
                        : "Vale subido, pero no se pudo leer la cantidad en la foto."}
                  </p>
                )}
                <Button
                  className="w-full"
                  onClick={() => {
                    setQrDialogOpen(false);
                    router.push("/driver");
                  }}
                >
                  Volver al inicio
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={incidentDialogOpen} onOpenChange={setIncidentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reportar novedad</DialogTitle>
          </DialogHeader>
          {incidentSuccess ? (
            <div className="space-y-3 text-center">
              <p className="text-base font-semibold text-success">Novedad reportada</p>
              <p className="text-xs text-muted-foreground">
                {incidentSeverity === "CRITICAL"
                  ? "Al ser critica, el viaje quedo bloqueado hasta que se resuelva."
                  : "El despachador la vera en el panel de novedades."}
              </p>
              <Button className="w-full" onClick={() => setIncidentDialogOpen(false)}>
                Cerrar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={incidentType} onValueChange={(v) => setIncidentType(v as IncidentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MECHANICAL_FAILURE">Falla mecanica</SelectItem>
                    <SelectItem value="TRAFFIC_ACCIDENT">Accidente de transito</SelectItem>
                    <SelectItem value="DELAY">Demora</SelectItem>
                    <SelectItem value="WEATHER">Clima</SelectItem>
                    <SelectItem value="SECURITY">Seguridad</SelectItem>
                    <SelectItem value="CARGO_ISSUE">Problema de carga</SelectItem>
                    <SelectItem value="ROAD_CLOSURE">Via cerrada</SelectItem>
                    <SelectItem value="OTHER">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severidad</Label>
                <Select value={incidentSeverity} onValueChange={(v) => setIncidentSeverity(v as IncidentSeverity)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Baja</SelectItem>
                    <SelectItem value="MEDIUM">Media</SelectItem>
                    <SelectItem value="HIGH">Alta</SelectItem>
                    <SelectItem value="CRITICAL">Critica (bloquea el viaje)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="incident-description">Descripcion</Label>
                <Textarea
                  id="incident-description"
                  rows={3}
                  value={incidentDescription}
                  onChange={(e) => setIncidentDescription(e.target.value)}
                  placeholder="Que paso..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="incident-photo">Foto (opcional)</Label>
                <input
                  id="incident-photo"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setIncidentPhoto(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                La ubicacion se captura automaticamente. Esta accion requiere conexion a internet.
              </p>
              {incidentError && <p className="text-sm text-destructive">{incidentError}</p>}
              <DialogFooter>
                <Button
                  disabled={incidentDescription.trim().length < 5 || incidentMutation.isPending}
                  onClick={() => incidentMutation.mutate()}
                >
                  {incidentMutation.isPending ? "Enviando..." : "Reportar"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
