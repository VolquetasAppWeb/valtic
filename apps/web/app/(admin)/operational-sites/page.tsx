"use client";

import { Fragment, Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, MapPin, Pencil, Plus, Power, PowerOff, QrCode, Trash2 } from "lucide-react";
import { operationalSiteSchema, type OperationalSiteInput } from "@valtic/validation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/status-badge";
import { AddressSearch } from "@/components/admin/address-search";
import { apiClient, ApiError } from "@/lib/api-client";
import type { OperationalSite, PaginatedResult, Project } from "@/lib/api-types";

const SiteMapPicker = dynamic(() => import("@/components/admin/site-map-picker"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const SITE_TYPE_LABEL: Record<string, string> = { LOAD: "Cargue", UNLOAD: "Descargue", BOTH: "Cargue y descargue" };

function OperationalSitesContent(): JSX.Element {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdFilter = searchParams.get("projectId") ?? "";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OperationalSite | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [qrDialogSite, setQrDialogSite] = useState<OperationalSite | null>(null);
  const [qrResult, setQrResult] = useState<{ token: string; expiresAt: string } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<OperationalSite | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function setProjectFilter(value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "sitios");
    if (value) {
      params.set("projectId", value);
    } else {
      params.delete("projectId");
    }
    // Este componente ahora se renderiza dentro del modulo fusionado
    // /operations (pestaña "sitios"), asi que el filtro debe quedarse ahi
    // en vez de saltar a la ruta standalone /operational-sites.
    router.replace(`/operations${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const sitesParams = new URLSearchParams();
  if (projectIdFilter) sitesParams.set("projectId", projectIdFilter);
  if (typeFilter) sitesParams.set("type", typeFilter);

  const { data: sites, isLoading } = useQuery({
    queryKey: ["operational-sites", projectIdFilter, typeFilter],
    queryFn: () =>
      apiClient.get<OperationalSite[]>(`/operational-sites${sitesParams.toString() ? `?${sitesParams.toString()}` : ""}`),
    refetchInterval: 15_000,
  });

  const { data: projectsData } = useQuery({
    queryKey: ["projects", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<Project>>("/projects?pageSize=100"),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OperationalSiteInput>({ resolver: zodResolver(operationalSiteSchema) });

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    reset({ projectId: projectIdFilter ?? "", name: "", type: "LOAD", address: "", latitude: 0, longitude: 0, geofenceRadius: 50 });
    setDialogOpen(true);
  }

  function openEdit(site: OperationalSite): void {
    setEditing(site);
    setFormError(null);
    reset({
      projectId: site.projectId,
      name: site.name,
      type: site.type,
      address: site.address,
      latitude: site.latitude,
      longitude: site.longitude,
      geofenceRadius: site.geofenceRadius,
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: OperationalSiteInput) =>
      editing
        ? apiClient.patch<OperationalSite>(`/operational-sites/${editing.id}`, values)
        : apiClient.post<OperationalSite>("/operational-sites", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operational-sites"] });
      setDialogOpen(false);
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.response.message : "No se pudo guardar el punto operativo.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      apiClient.patch<OperationalSite>(`/operational-sites/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operational-sites"] }),
  });

  const qrMutation = useMutation({
    mutationFn: (operationalSiteId: string) =>
      apiClient.post<{ token: string; expiresAt: string }>("/qr/generate", { operationalSiteId }),
    onSuccess: (data) => {
      setQrResult(data);
      setQrError(null);
    },
    onError: (error: unknown) => {
      setQrError(error instanceof ApiError ? error.response.message : "No se pudo generar el codigo QR.");
    },
  });

  function openQrDialog(site: OperationalSite): void {
    setQrDialogSite(site);
    setQrResult(null);
    setQrError(null);
    qrMutation.mutate(site.id);
  }

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.delete<void>(`/operational-sites/${id}`, { body: reason ? { reason } : {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operational-sites"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDeleteTarget(null);
      setDeleteReason("");
      setDeleteError(null);
    },
    onError: (error: unknown) => {
      setDeleteError(error instanceof ApiError ? error.response.message : "No se pudo eliminar el punto operativo.");
    },
  });

  const projects = projectsData?.data ?? [];
  const projectId = watch("projectId");
  // El backend ya devuelve los puntos ordenados por obra y luego por
  // nombre — aca solo se detecta cuando cambia la obra para insertar un
  // encabezado de grupo, en vez de una lista plana dificil de escanear.
  const sitesList = sites ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Puntos operativos</h1>
          <p className="text-sm text-muted-foreground">Puntos de cargue y descargue, con su geocerca.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo punto
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>Obra</Label>
          <Select value={projectIdFilter || "ALL"} onValueChange={(v) => setProjectFilter(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Todas las obras" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las obras</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={typeFilter || "ALL"} onValueChange={(v) => setTypeFilter(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los tipos</SelectItem>
              <SelectItem value="LOAD">Cargue</SelectItem>
              <SelectItem value="UNLOAD">Descargue</SelectItem>
              <SelectItem value="BOTH">Cargue y descargue</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : sitesList.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={MapPin} title="Sin puntos operativos" description="Crea el primer punto de cargue o descargue." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Direccion</TableHead>
                <TableHead>Radio geocerca</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sitesList.map((site, index) => {
                const previousProjectId = sitesList[index - 1]?.project?.id;
                const showGroupHeader = site.project?.id !== previousProjectId;
                return (
                  <Fragment key={site.id}>
                    {showGroupHeader && (
                      <TableRow className="bg-secondary/30 hover:bg-secondary/30">
                        <TableCell colSpan={6} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {site.project?.name ?? "Sin obra"}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow key={site.id}>
                      <TableCell className="font-medium">{site.name}</TableCell>
                      <TableCell className="text-muted-foreground">{SITE_TYPE_LABEL[site.type]}</TableCell>
                      <TableCell className="text-muted-foreground">{site.address}</TableCell>
                      <TableCell className="text-muted-foreground">{site.geofenceRadius} m</TableCell>
                      <TableCell>
                        <StatusBadge status={site.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {(site.type === "UNLOAD" || site.type === "BOTH") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openQrDialog(site)}
                              aria-label="Generar QR de cierre"
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => openEdit(site)} aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={site.status === "ACTIVE" ? "Desactivar" : "Activar"}
                            onClick={() =>
                              statusMutation.mutate({ id: site.id, status: site.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
                            }
                          >
                            {site.status === "ACTIVE" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Eliminar"
                            onClick={() => {
                              setDeleteTarget(site);
                              setDeleteReason("");
                              setDeleteError(null);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar punto operativo" : "Nuevo punto operativo"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit((values) => saveMutation.mutate(values))}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Obra</Label>
                <Select value={projectId} onValueChange={(value) => setValue("projectId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una obra" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.projectId && <p className="text-xs text-destructive">{errors.projectId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={watch("type")}
                  onValueChange={(value) => setValue("type", value as OperationalSiteInput["type"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOAD">Cargue</SelectItem>
                    <SelectItem value="UNLOAD">Descargue</SelectItem>
                    <SelectItem value="BOTH">Cargue y descargue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Direccion</Label>
              <Input id="address" {...register("address")} />
              {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="latitude">Latitud</Label>
                <Input id="latitude" type="number" step="0.000001" {...register("latitude")} />
                {errors.latitude && <p className="text-xs text-destructive">{errors.latitude.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="longitude">Longitud</Label>
                <Input id="longitude" type="number" step="0.000001" {...register("longitude")} />
                {errors.longitude && <p className="text-xs text-destructive">{errors.longitude.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="geofenceRadius">Radio (m)</Label>
                <Input id="geofenceRadius" type="number" {...register("geofenceRadius")} />
                {errors.geofenceRadius && <p className="text-xs text-destructive">{errors.geofenceRadius.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ubicacion en el mapa</Label>
              <AddressSearch
                placeholder="Escribe la direccion para ubicarla automaticamente..."
                onSelect={(result) => {
                  setValue("latitude", Number(result.lat.toFixed(6)));
                  setValue("longitude", Number(result.lon.toFixed(6)));
                  if (!watch("address")) setValue("address", result.displayName);
                }}
              />
              <div className="h-64 w-full overflow-hidden rounded-md border border-border">
                {dialogOpen && (
                  <SiteMapPicker
                    latitude={Number(watch("latitude")) || 0}
                    longitude={Number(watch("longitude")) || 0}
                    radius={Number(watch("geofenceRadius")) || 50}
                    label={watch("name") || "Nuevo punto"}
                    onChange={(lat, lng) => {
                      setValue("latitude", Number(lat.toFixed(6)));
                      setValue("longitude", Number(lng.toFixed(6)));
                    }}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Haz clic en el mapa para ubicar el punto, o arrastra el marcador para ajustarlo.
              </p>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrDialogSite} onOpenChange={(open) => !open && setQrDialogSite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Codigo QR de cierre — {qrDialogSite?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {qrMutation.isPending && <p className="text-sm text-muted-foreground">Generando...</p>}
            {qrError && <p className="text-sm text-destructive">{qrError}</p>}
            {qrResult && (
              <>
                <p className="text-xs text-muted-foreground">
                  De un solo uso, expira {new Date(qrResult.expiresAt).toLocaleTimeString("es-CO")}. En el MVP web
                  el conductor lo ingresa manualmente en la app (seccion 14 del alcance); el renderizado como
                  imagen QR escaneable con camara queda para una iteracion posterior.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="flex-1 break-all rounded-md border border-border bg-secondary/40 p-3 text-xs">
                    {qrResult.token}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Copiar"
                    onClick={() => navigator.clipboard.writeText(qrResult.token)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar punto operativo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vas a eliminar el punto <span className="font-medium text-foreground">{deleteTarget?.name}</span>. La
              obra y sus demas puntos/tarifas no se ven afectados. Se bloquea si tiene viajes en curso.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="site-delete-reason">Motivo (opcional)</Label>
              <Textarea
                id="site-delete-reason"
                rows={2}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Por que se elimina este punto..."
              />
            </div>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, reason: deleteReason })}
              >
                {deleteMutation.isPending ? "Eliminando..." : "Eliminar punto"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OperationalSitesPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <OperationalSitesContent />
    </Suspense>
  );
}
