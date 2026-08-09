"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Power, PowerOff, Receipt } from "lucide-react";
import { rateSchema, type RateInput } from "@valtic/validation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/status-badge";
import { apiClient, ApiError } from "@/lib/api-client";
import type { FleetOwner, Material, OperationalSite, PaginatedResult, Project, Rate } from "@/lib/api-types";

const RATE_TYPE_LABEL: Record<string, string> = {
  PER_TRIP: "Por viaje",
  PER_TON: "Por tonelada",
  PER_CUBIC_METER: "Por m3",
  PER_KILOMETER: "Por kilometro",
  FIXED: "Fija",
};

const currencyFormatter = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export default function RatesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [projectFilter, setProjectFilter] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const rateParams = new URLSearchParams();
  if (projectFilter) rateParams.set("projectId", projectFilter);
  if (materialFilter) rateParams.set("materialId", materialFilter);
  const rateQueryString = rateParams.toString();

  const { data: rates, isLoading } = useQuery({
    queryKey: ["rates", projectFilter, materialFilter],
    queryFn: () => apiClient.get<Rate[]>(`/rates${rateQueryString ? `?${rateQueryString}` : ""}`),
    refetchInterval: 15_000,
  });

  const { data: projectsData } = useQuery({
    queryKey: ["projects", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<Project>>("/projects?pageSize=100"),
  });
  const { data: materialsData } = useQuery({
    queryKey: ["materials", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<Material>>("/materials?pageSize=100"),
  });
  const { data: sitesData } = useQuery({
    queryKey: ["operational-sites", "for-select"],
    queryFn: () => apiClient.get<OperationalSite[]>("/operational-sites"),
  });
  const { data: ownersData } = useQuery({
    queryKey: ["fleet-owners", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<FleetOwner>>("/fleet-owners?pageSize=100"),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RateInput>({ resolver: zodResolver(rateSchema) });

  function openCreate(): void {
    setFormError(null);
    reset({
      projectId: "",
      originSiteId: "",
      destinationSiteId: "",
      materialId: "",
      fleetOwnerId: "",
      rateType: "PER_TRIP",
      value: 0,
      validFrom: new Date().toISOString().slice(0, 10),
      validUntil: "",
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: RateInput) => {
      const payload = { ...values, fleetOwnerId: values.fleetOwnerId || undefined, validUntil: values.validUntil || undefined };
      return apiClient.post<Rate>("/rates", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rates"] });
      setDialogOpen(false);
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.response.message : "No se pudo guardar la tarifa.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "EXPIRED" | "INACTIVE" }) =>
      apiClient.patch<Rate>(`/rates/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rates"] }),
  });

  const projects = projectsData?.data ?? [];
  const materials = materialsData?.data ?? [];
  const sites = sitesData ?? [];
  const owners = ownersData?.data ?? [];
  const selectedProjectId = watch("projectId");
  const sitesForProject = sites.filter((site) => site.projectId === selectedProjectId);
  const visibleRates = (rates ?? []).filter((rate) => !statusFilter || rate.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tarifas</h1>
          <p className="text-sm text-muted-foreground">
            Tarifas por obra, origen, destino y material. No se editan: cada cambio crea una nueva tarifa versionada.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nueva tarifa
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>Obra</Label>
          <Select value={projectFilter || "ALL"} onValueChange={(v) => setProjectFilter(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-52">
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
          <Label>Material</Label>
          <Select value={materialFilter || "ALL"} onValueChange={(v) => setMaterialFilter(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos los materiales" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los materiales</SelectItem>
              {materials.map((material) => (
                <SelectItem key={material.id} value={material.id}>
                  {material.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="ACTIVE">Activa</SelectItem>
              <SelectItem value="EXPIRED">Expirada</SelectItem>
              <SelectItem value="INACTIVE">Inactiva</SelectItem>
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
        ) : visibleRates.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Receipt} title="Sin tarifas registradas" description="Crea la primera tarifa para una ruta." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Obra</TableHead>
                <TableHead>Ruta</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRates.map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell className="font-medium">{rate.project?.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {rate.originSite?.name} → {rate.destinationSite?.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{rate.material?.name}</TableCell>
                  <TableCell className="text-muted-foreground">{RATE_TYPE_LABEL[rate.rateType]}</TableCell>
                  <TableCell className="font-medium">{currencyFormatter.format(Number(rate.value))}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {rate.validFrom.slice(0, 10)} {rate.validUntil ? `- ${rate.validUntil.slice(0, 10)}` : ""}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={rate.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={rate.status === "ACTIVE" ? "Desactivar" : "Activar"}
                      onClick={() =>
                        statusMutation.mutate({ id: rate.id, status: rate.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
                      }
                    >
                      {rate.status === "ACTIVE" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva tarifa</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit((values) => saveMutation.mutate(values))}>
            <div className="space-y-1.5">
              <Label>Obra</Label>
              <Select
                value={selectedProjectId}
                onValueChange={(value) => {
                  setValue("projectId", value);
                  setValue("originSiteId", "");
                  setValue("destinationSiteId", "");
                }}
              >
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Origen</Label>
                <Select value={watch("originSiteId")} onValueChange={(value) => setValue("originSiteId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Punto de cargue" />
                  </SelectTrigger>
                  <SelectContent>
                    {sitesForProject.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.originSiteId && <p className="text-xs text-destructive">{errors.originSiteId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Destino</Label>
                <Select value={watch("destinationSiteId")} onValueChange={(value) => setValue("destinationSiteId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Punto de descargue" />
                  </SelectTrigger>
                  <SelectContent>
                    {sitesForProject.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.destinationSiteId && <p className="text-xs text-destructive">{errors.destinationSiteId.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Material</Label>
                <Select value={watch("materialId")} onValueChange={(value) => setValue("materialId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((material) => (
                      <SelectItem key={material.id} value={material.id}>
                        {material.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.materialId && <p className="text-xs text-destructive">{errors.materialId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Propietario (opcional)</Label>
                <Select value={watch("fleetOwnerId")} onValueChange={(value) => setValue("fleetOwnerId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los propietarios" />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de tarifa</Label>
                <Select value={watch("rateType")} onValueChange={(value) => setValue("rateType", value as RateInput["rateType"])}>
                  <SelectTrigger>
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
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="value">Valor (COP)</Label>
                <Input id="value" type="number" step="1" {...register("value")} />
                {errors.value && <p className="text-xs text-destructive">{errors.value.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="validFrom">Vigente desde</Label>
                <Input id="validFrom" type="date" {...register("validFrom")} />
                {errors.validFrom && <p className="text-xs text-destructive">{errors.validFrom.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="validUntil">Vigente hasta (opcional)</Label>
                <Input id="validUntil" type="date" {...register("validUntil")} />
              </div>
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
    </div>
  );
}
