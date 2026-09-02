"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, Loader2, MapPin, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddressSearch } from "@/components/admin/address-search";
import { AudioRecorder } from "@/components/admin/audio-recorder";
import { apiClient, ApiError } from "@/lib/api-client";
import type { OperationsSetupDraft } from "@/lib/api-types";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const SiteMapPicker = dynamic(() => import("@/components/admin/site-map-picker"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const SITE_TYPE_LABEL: Record<string, string> = { LOAD: "Cargue", UNLOAD: "Descargue", BOTH: "Cargue y descargue" };
const RATE_TYPE_LABEL: Record<string, string> = {
  PER_TRIP: "Por viaje",
  PER_TON: "Por tonelada",
  PER_CUBIC_METER: "Por m3",
  PER_KILOMETER: "Por kilometro",
  FIXED: "Fija",
};
const VEHICLE_TYPE_LABEL: Record<string, string> = {
  DUMP_TRUCK: "Sencilla",
  DOUBLE_TRAILER: "Doble troque / B200",
  MINI_DUMP_TRUCK: "Mini",
  TRACTOR_TRAILER: "Tractomula",
  OTHER: "Otro",
};
type VehicleType = keyof typeof VEHICLE_TYPE_LABEL;

interface SiteDraft {
  name: string;
  type: "LOAD" | "UNLOAD" | "BOTH";
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadius: number;
}

interface RateDraft {
  originSiteIndex: number;
  destinationSiteIndex: number;
  materialName: string;
  rateType: "PER_TRIP" | "PER_TON" | "PER_CUBIC_METER" | "PER_KILOMETER" | "FIXED";
  value: number;
  vehicleType?: VehicleType;
}

// Sin "name": la obra no tiene nombre propio en este flujo — el "codigo"
// es el unico identificador, y se genera solo a partir de los puntos de
// cargue/descargue (ver generateProjectCode) en vez de escribirse a mano.
interface ProjectDraft {
  code: string;
  clientName: string;
  description: string;
  startDate: string;
  endDate: string;
}

const EMPTY_PROJECT: ProjectDraft = {
  code: "",
  clientName: "",
  description: "",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
};

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// El codigo (identificador de la obra) se arma solo a partir del primer
// punto de cargue y el primer punto de descargue — es como el despachador
// la reconoce de todos modos ("de General Santander a Botadero Km 20"), asi
// que no tiene sentido pedirle que tambien invente un nombre/codigo aparte.
function generateProjectCode(sites: SiteDraft[]): string {
  const load = sites.find((s) => s.type === "LOAD" || s.type === "BOTH");
  const unload = sites.find((s) => s.type === "UNLOAD" || s.type === "BOTH");
  const parts = [load?.name, unload?.name].filter((name): name is string => !!name?.trim());
  const code = parts.map(slugify).filter(Boolean).join("-").slice(0, 40);
  return code || "OBRA";
}

// Combina nombre + direccion para la busqueda automatica, sin depender de
// que la IA haya incluido el nombre del sitio dentro de "address" — si la
// direccion extraida quedo demasiado generica (ej. solo la ciudad, sin el
// nombre del lugar), buscar solo esa direccion ubica el punto en el centro
// de la ciudad en vez del sitio real. Con el nombre siempre al frente, el
// geocoder tiene la referencia especifica aunque la direccion sea vaga.
function siteSearchQuery(site: SiteDraft): string {
  if (!site.address) return site.name;
  if (!site.name || site.address.toLowerCase().includes(site.name.toLowerCase())) return site.address;
  return `${site.name}, ${site.address}`;
}

function draftToSites(draft: OperationsSetupDraft): SiteDraft[] {
  return draft.sites.map((s) => ({
    name: s.name ?? "",
    type: s.type ?? "LOAD",
    address: s.address ?? "",
    latitude: 0,
    longitude: 0,
    geofenceRadius: 50,
  }));
}

function draftToRates(draft: OperationsSetupDraft, sites: SiteDraft[]): RateDraft[] {
  const indexByName = new Map(sites.map((s, i) => [s.name.trim().toLowerCase(), i]));
  const result: RateDraft[] = [];
  for (const r of draft.rates) {
    const originIndex = r.originSiteName ? indexByName.get(r.originSiteName.trim().toLowerCase()) : undefined;
    const destinationIndex = r.destinationSiteName ? indexByName.get(r.destinationSiteName.trim().toLowerCase()) : undefined;
    if (originIndex === undefined || destinationIndex === undefined || !r.materialName || !r.value) continue;
    result.push({
      originSiteIndex: originIndex,
      destinationSiteIndex: destinationIndex,
      materialName: r.materialName,
      rateType: r.rateType ?? "PER_TRIP",
      value: r.value,
      vehicleType: r.vehicleType ?? undefined,
    });
  }
  return result;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

// Reemplaza el llenado manual de Obra + Puntos operativos + Tarifas por un
// flujo guiado: 1) pega/adjunta la orden de trabajo del cliente, 2) la IA
// (Gemini) arma un borrador, 3) el usuario lo revisa/edita y confirma las
// ubicaciones en el mapa, 4) un solo clic crea todo junto. Tambien se puede
// saltar la IA y armar el borrador a mano desde cero.
export function OperationsQuickSetupWizard({ open, onOpenChange, onCreated }: Props): JSX.Element {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"input" | "review">("input");
  const [pastedText, setPastedText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [project, setProject] = useState<ProjectDraft>(EMPTY_PROJECT);
  const [sites, setSites] = useState<SiteDraft[]>([]);
  const [rates, setRates] = useState<RateDraft[]>([]);
  const [bulkMaterial, setBulkMaterial] = useState("");
  const [bulkRateType, setBulkRateType] = useState<RateDraft["rateType"]>("PER_TRIP");
  const [bulkVehicleType, setBulkVehicleType] = useState<VehicleType | "">("");
  const [bulkValue, setBulkValue] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Mientras el usuario no toque el campo Codigo a mano, se sigue
  // regenerando solo cada vez que cambian los nombres de cargue/descargue —
  // apenas lo edita directamente, se deja de tocar para no pisar su cambio.
  const codeTouchedRef = useRef(false);

  useEffect(() => {
    if (codeTouchedRef.current) return;
    setProject((p) => ({ ...p, code: generateProjectCode(sites) }));
  }, [sites]);

  function reset(): void {
    setStep("input");
    setPastedText("");
    setFiles([]);
    setAudioBlob(null);
    setExtractError(null);
    setProject(EMPTY_PROJECT);
    setSites([]);
    setRates([]);
    setSubmitError(null);
    codeTouchedRef.current = false;
  }

  const extractMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      if (pastedText.trim()) form.append("text", pastedText.trim());
      files.forEach((file) => form.append("files", file));
      if (audioBlob) form.append("audio", audioBlob, "orden-de-trabajo.webm");
      return apiClient.post<OperationsSetupDraft>("/operations/extract-setup", form);
    },
    onSuccess: (draft) => {
      const draftSites = draftToSites(draft);
      codeTouchedRef.current = false;
      setProject({
        code: generateProjectCode(draftSites),
        clientName: draft.project.clientName ?? "",
        description: draft.project.description ?? "",
        startDate: draft.project.startDate ?? new Date().toISOString().slice(0, 10),
        endDate: draft.project.endDate ?? "",
      });
      setSites(draftSites);
      setRates(draftToRates(draft, draftSites));
      setExtractError(null);
      setStep("review");
    },
    onError: (error: unknown) => {
      setExtractError(error instanceof ApiError ? error.response.message : "No se pudo leer la orden de trabajo.");
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/operations/quick-setup", {
        project: {
          code: project.code,
          clientName: project.clientName || undefined,
          description: project.description || undefined,
          startDate: project.startDate,
          endDate: project.endDate || undefined,
        },
        sites: sites.map((s) => ({
          name: s.name,
          type: s.type,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          geofenceRadius: s.geofenceRadius,
        })),
        rates: rates.map((r) => ({
          originSiteIndex: r.originSiteIndex,
          destinationSiteIndex: r.destinationSiteIndex,
          materialName: r.materialName,
          rateType: r.rateType,
          value: r.value,
          vehicleType: r.vehicleType || undefined,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["operational-sites"] });
      queryClient.invalidateQueries({ queryKey: ["rates"] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      onCreated();
      onOpenChange(false);
      reset();
    },
    onError: (error: unknown) => {
      setSubmitError(error instanceof ApiError ? error.response.message : "No se pudo crear la obra.");
    },
  });

  const loadSites = useMemo(() => sites.filter((s) => s.type === "LOAD" || s.type === "BOTH"), [sites]);
  const unloadSites = useMemo(() => sites.filter((s) => s.type === "UNLOAD" || s.type === "BOTH"), [sites]);
  // Cada ruta cargue->descargue se genera junto con su inversa
  // descargue->cargue (el mismo camion suele necesitar tarifa para el
  // regreso) — sin duplicar si ambos puntos ya son "cargue y descargue" y
  // el propio cruce de listas ya habia generado ese sentido.
  const routePairs = useMemo(() => {
    const pairs: Array<{ originIndex: number; destinationIndex: number }> = [];
    const seen = new Set<string>();
    for (const origin of loadSites) {
      const originIndex = sites.indexOf(origin);
      for (const destination of unloadSites) {
        const destinationIndex = sites.indexOf(destination);
        if (originIndex === destinationIndex) continue;
        const key = `${originIndex}-${destinationIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ originIndex, destinationIndex });
      }
    }
    for (const { originIndex, destinationIndex } of [...pairs]) {
      const reverseKey = `${destinationIndex}-${originIndex}`;
      if (seen.has(reverseKey)) continue;
      seen.add(reverseKey);
      pairs.push({ originIndex: destinationIndex, destinationIndex: originIndex });
    }
    return pairs;
  }, [loadSites, unloadSites, sites]);
  const routeCount = routePairs.length;

  const canSubmit =
    project.code.trim().length >= 1 &&
    !!project.startDate &&
    sites.length > 0 &&
    sites.every((s) => s.name.trim().length >= 2 && s.latitude !== 0 && s.longitude !== 0) &&
    !createMutation.isPending;

  function updateSite(index: number, patch: Partial<SiteDraft>): void {
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSite(): void {
    setSites((prev) => [...prev, { name: "", type: "LOAD", address: "", latitude: 0, longitude: 0, geofenceRadius: 50 }]);
  }

  function removeSite(index: number): void {
    setSites((prev) => prev.filter((_, i) => i !== index));
    setRates((prev) =>
      prev
        .filter((r) => r.originSiteIndex !== index && r.destinationSiteIndex !== index)
        .map((r) => ({
          ...r,
          originSiteIndex: r.originSiteIndex > index ? r.originSiteIndex - 1 : r.originSiteIndex,
          destinationSiteIndex: r.destinationSiteIndex > index ? r.destinationSiteIndex - 1 : r.destinationSiteIndex,
        })),
    );
  }

  function addRate(): void {
    setRates((prev) => [...prev, { originSiteIndex: 0, destinationSiteIndex: 0, materialName: "", rateType: "PER_TRIP", value: 0 }]);
  }

  function removeRate(index: number): void {
    setRates((prev) => prev.filter((_, i) => i !== index));
  }

  // Duplica una tarifa ya llena (material, tipo, valor, vehiculo) con el
  // origen y destino invertidos, para no tener que volver a escribirla a
  // mano — el pedido puntual de "que la genere el sistema" para una
  // tarifa agregada manualmente, no solo para el generador masivo.
  function addReverseRate(index: number): void {
    const rate = rates[index];
    if (!rate) return;
    setRates((prev) => [
      ...prev,
      {
        ...rate,
        originSiteIndex: rate.destinationSiteIndex,
        destinationSiteIndex: rate.originSiteIndex,
      },
    ]);
  }

  function hasReverseRate(rate: RateDraft): boolean {
    return rates.some(
      (r) =>
        r.originSiteIndex === rate.destinationSiteIndex &&
        r.destinationSiteIndex === rate.originSiteIndex &&
        r.materialName.trim().toLowerCase() === rate.materialName.trim().toLowerCase(),
    );
  }

  // El caso mas comun: una obra tiene N canteras y M botaderos, y todas las
  // combinaciones se cobran igual para un material. En vez de crear cada
  // ruta a mano, esto genera todas las combinaciones origen(cargue) x
  // destino(descargue) de una vez con el mismo material/tipo/valor —
  // incluyendo automaticamente la ruta inversa de cada una (ver routePairs).
  function generateAllRoutes(): void {
    if (!bulkMaterial.trim() || !bulkValue) return;
    const value = Number(bulkValue);
    if (!Number.isFinite(value) || value <= 0) return;

    const generated: RateDraft[] = routePairs.map(({ originIndex, destinationIndex }) => ({
      originSiteIndex: originIndex,
      destinationSiteIndex: destinationIndex,
      materialName: bulkMaterial.trim(),
      rateType: bulkRateType,
      value,
      vehicleType: bulkVehicleType || undefined,
    }));
    setRates((prev) => [...prev, ...generated]);
    setBulkMaterial("");
    setBulkValue("");
    setBulkVehicleType("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!extractMutation.isPending && !createMutation.isPending) {
          onOpenChange(next);
          if (!next) reset();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Añadiendo nueva obra
          </DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Graba o sube un audio describiendo la obra, pega el texto de la orden de trabajo/cotizacion, o adjunta
              foto(s) del documento — se puede combinar mas de uno. La IA arma un borrador de la obra, sus puntos
              operativos y las tarifas — lo revisas y ajustas antes de crear nada.
            </p>
            <div className="flex items-start gap-3 rounded-md border-2 border-warning bg-warning/10 p-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
              <p className="text-base font-bold leading-snug text-foreground">
                Especifica bien la direccion de cargue y descargue, y menciona siempre la CIUDAD (ej. &ldquo;Altos
                de Granada, Manizales&rdquo; o &ldquo;Carrera 7 # 11-10, Bogota&rdquo;) — sin la ciudad, la IA no
                puede ubicar el punto correctamente.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Audio (opcional) — dicta la obra de palabra</Label>
              <AudioRecorder value={audioBlob} onChange={setAudioBlob} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pasted-text">Texto de la orden de trabajo (opcional)</Label>
              <Textarea
                id="pasted-text"
                rows={6}
                placeholder="Obra: Via Perimetral Norte&#10;Cliente: Alcaldia Municipal&#10;Cantera El Roble -> Botadero Km 12: recebo comun $85.000 por viaje..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-files">Fotos del documento (opcional)</Label>
              <Input
                id="setup-files"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              {files.length > 0 && <p className="text-xs text-muted-foreground">{files.length} foto(s) seleccionada(s)</p>}
            </div>
            {extractError && <p className="text-sm text-destructive">{extractError}</p>}
            <DialogFooter>
              <Button
                type="button"
                disabled={(!pastedText.trim() && files.length === 0 && !audioBlob) || extractMutation.isPending}
                onClick={() => extractMutation.mutate()}
              >
                {extractMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Leyendo...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> Siguiente
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-6">
            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="text-sm font-semibold">Obra</p>
              <p className="text-xs text-muted-foreground">
                La obra se identifica por el codigo, generado solo a partir de los puntos de cargue y descargue de
                abajo — lo puedes ajustar si quieres.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Codigo</Label>
                  <Input
                    value={project.code}
                    onChange={(e) => {
                      codeTouchedRef.current = true;
                      setProject((p) => ({ ...p, code: e.target.value }));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Cliente (opcional)</Label>
                  <Input value={project.clientName} onChange={(e) => setProject((p) => ({ ...p, clientName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha de inicio</Label>
                  <Input
                    type="date"
                    value={project.startDate}
                    onChange={(e) => setProject((p) => ({ ...p, startDate: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Puntos operativos ({sites.length})</p>
                <Button type="button" variant="outline" size="sm" onClick={addSite}>
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </Button>
              </div>
              {sites.length === 0 && <p className="text-xs text-muted-foreground">Sin puntos todavia.</p>}
              <div className="space-y-2">
                {sites.map((site, index) => {
                  const located = site.latitude !== 0 || site.longitude !== 0;
                  return (
                    <div key={index} className="rounded-md border border-border p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="w-40"
                          placeholder="Nombre"
                          value={site.name}
                          onChange={(e) => updateSite(index, { name: e.target.value })}
                        />
                        <Select value={site.type} onValueChange={(v) => updateSite(index, { type: v as SiteDraft["type"] })}>
                          <SelectTrigger className="h-9 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LOAD">Cargue</SelectItem>
                            <SelectItem value="UNLOAD">Descargue</SelectItem>
                            <SelectItem value="BOTH">Cargue y descargue</SelectItem>
                          </SelectContent>
                        </Select>
                        {/* La busqueda automatica siempre incluye el nombre del sitio (ver
                            siteSearchQuery) — si la direccion que trajo la IA quedo muy
                            generica (ej. solo la ciudad), el nombre evita que el pin caiga
                            en el centro de la ciudad en vez del lugar real. */}
                        <div className="min-w-[200px] flex-1">
                          <AddressSearch
                            placeholder="Buscar direccion..."
                            initialQuery={!located ? siteSearchQuery(site) : undefined}
                            autoSelectFirst={!located}
                            onSelect={(result) => {
                              updateSite(index, { latitude: result.lat, longitude: result.lon, address: result.displayName });
                            }}
                          />
                        </div>
                        <Badge variant={located ? "success" : "warning"}>
                          <MapPin className="mr-1 h-3 w-3" />
                          {located ? "Ubicado" : "Falta ubicar"}
                        </Badge>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeSite(index)} aria-label="Quitar">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {/* El mapa aparece solo, sin que haya que hacer clic en nada — apenas
                          la direccion se ubica automaticamente (o el usuario escribe una),
                          para poder ver y ajustar el pin de una vez. */}
                      <div className="mt-2 h-56 w-full overflow-hidden rounded-md border border-border">
                        <SiteMapPicker
                          latitude={site.latitude}
                          longitude={site.longitude}
                          radius={site.geofenceRadius}
                          label={site.name || "Nuevo punto"}
                          onChange={(lat, lng) => updateSite(index, { latitude: lat, longitude: lng })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Tarifas ({rates.length})</p>
                <Button type="button" variant="outline" size="sm" onClick={addRate} disabled={sites.length < 2}>
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </Button>
              </div>

              {/* Generador masivo de rutas (Material/Tipo/Vehiculo/Valor +
                  "Generar N rutas") oculto a pedido: quedaba confuso tener
                  dos formas de generar la ruta inversa (este formulario y
                  el boton "Invertir ruta" de cada fila). La funcion
                  generateAllRoutes/routePairs se deja intacta en el codigo
                  por si se quiere reactivar mas adelante. */}

              {rates.length === 0 && <p className="text-xs text-muted-foreground">Sin tarifas todavia.</p>}
              <div className="space-y-2">
                {rates.map((rate, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                    <Select value={String(rate.originSiteIndex)} onValueChange={(v) => setRates((prev) => prev.map((r, i) => (i === index ? { ...r, originSiteIndex: Number(v) } : r)))}>
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue placeholder="Origen" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map((s, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {s.name || `Punto ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">→</span>
                    <Select
                      value={String(rate.destinationSiteIndex)}
                      onValueChange={(v) => setRates((prev) => prev.map((r, i) => (i === index ? { ...r, destinationSiteIndex: Number(v) } : r)))}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue placeholder="Destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map((s, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {s.name || `Punto ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 w-32"
                      placeholder="Material"
                      value={rate.materialName}
                      onChange={(e) => setRates((prev) => prev.map((r, i) => (i === index ? { ...r, materialName: e.target.value } : r)))}
                    />
                    <Select
                      value={rate.rateType}
                      onValueChange={(v) => setRates((prev) => prev.map((r, i) => (i === index ? { ...r, rateType: v as RateDraft["rateType"] } : r)))}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RATE_TYPE_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 w-28"
                      type="number"
                      placeholder="Valor"
                      value={rate.value || ""}
                      onChange={(e) => setRates((prev) => prev.map((r, i) => (i === index ? { ...r, value: Number(e.target.value) } : r)))}
                    />
                    <Select
                      value={rate.vehicleType || "ALL"}
                      onValueChange={(v) =>
                        setRates((prev) => prev.map((r, i) => (i === index ? { ...r, vehicleType: v === "ALL" ? undefined : (v as VehicleType) } : r)))
                      }
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue placeholder="Vehiculo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Cualquier vehiculo</SelectItem>
                        {Object.entries(VEHICLE_TYPE_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-info text-info-foreground hover:bg-info/90"
                      onClick={() => addReverseRate(index)}
                      disabled={
                        rate.originSiteIndex === rate.destinationSiteIndex ||
                        !rate.materialName.trim() ||
                        hasReverseRate(rate)
                      }
                      title="Genera la misma tarifa en sentido contrario"
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                      Invertir ruta
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRate(index)} aria-label="Quitar">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setStep("input")}>
                Volver
              </Button>
              <Button type="button" disabled={!canSubmit} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creando...
                  </>
                ) : (
                  "Crear obra completa"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
