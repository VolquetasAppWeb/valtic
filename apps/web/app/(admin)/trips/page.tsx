"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Plus, Route } from "lucide-react";
import { createTripSchema, type CreateTripInput } from "@valtic/validation";
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
import type { Driver, OperationalSite, PaginatedResult, Project, Trip, Vehicle } from "@/lib/api-types";

const TRIP_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  ASSIGNED: "Asignado",
  ACCEPTED: "Aceptado",
  EN_ROUTE_TO_LOAD: "En ruta a cargue",
  LOADING: "Cargando",
  LOADED: "Cargado",
  EN_ROUTE_TO_UNLOAD: "En ruta a descargue",
  UNLOADING: "Descargando",
  PENDING_VALIDATION: "Pendiente de validacion",
  COMPLETED: "Completado",
  INCLUDED_IN_SETTLEMENT: "Incluido en liquidacion",
  SETTLED: "Liquidado",
  UNDER_REVIEW: "En revision",
  BLOCKED_BY_INCIDENT: "Bloqueado por novedad",
  MANUALLY_CLOSED: "Cierre manual",
  CANCELLED: "Cancelado",
  REJECTED: "Rechazado",
};

export default function TripsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [driverFilter, setDriverFilter] = useState<string>("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("");

  const tripsParams = new URLSearchParams({ pageSize: "50" });
  if (statusFilter) tripsParams.set("status", statusFilter);
  if (projectFilter) tripsParams.set("projectId", projectFilter);
  if (driverFilter) tripsParams.set("driverId", driverFilter);
  if (vehicleFilter) tripsParams.set("vehicleId", vehicleFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["trips", statusFilter, projectFilter, driverFilter, vehicleFilter],
    queryFn: () => apiClient.get<PaginatedResult<Trip>>(`/trips?${tripsParams.toString()}`),
    refetchInterval: 15_000,
  });

  const { data: projectsData } = useQuery({
    queryKey: ["projects", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<Project>>("/projects?pageSize=100"),
  });
  const { data: sitesData } = useQuery({
    queryKey: ["operational-sites", "for-select"],
    queryFn: () => apiClient.get<OperationalSite[]>("/operational-sites"),
  });
  const { data: driversData } = useQuery({
    queryKey: ["drivers", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<Driver>>("/drivers?pageSize=100"),
  });
  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<Vehicle>>("/vehicles?pageSize=100"),
  });
  const { data: materialsData } = useQuery({
    queryKey: ["materials", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<{ id: string; name: string; status: string }>>("/materials?pageSize=100"),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateTripInput>({ resolver: zodResolver(createTripSchema) });

  function openCreate(): void {
    setFormError(null);
    reset({
      projectId: "",
      driverId: "",
      vehicleId: "",
      originSiteId: "",
      destinationSiteId: "",
      materialId: "",
      quantityUnit: "TON",
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: CreateTripInput) => apiClient.post<Trip>("/trips", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      setDialogOpen(false);
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.response.message : "No se pudo crear el viaje.");
    },
  });

  const trips = data?.data ?? [];
  const projects = projectsData?.data ?? [];
  const sites = sitesData ?? [];
  const allDrivers = driversData?.data ?? [];
  const allVehicles = vehiclesData?.data ?? [];
  const drivers = allDrivers.filter((d) => d.status === "ACTIVE");
  const vehicles = allVehicles.filter((v) => v.status === "ACTIVE");
  const materials = (materialsData?.data ?? []).filter((m) => m.status === "ACTIVE");

  const selectedProjectId = watch("projectId");
  const sitesForProject = sites.filter((site) => site.projectId === selectedProjectId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Viajes</h1>
          <p className="text-sm text-muted-foreground">Creacion, asignacion y seguimiento de viajes.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo viaje
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select value={statusFilter || "ALL"} onValueChange={(value) => setStatusFilter(value === "ALL" ? "" : value)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              {Object.entries(TRIP_STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Obra</Label>
          <Select value={projectFilter || "ALL"} onValueChange={(value) => setProjectFilter(value === "ALL" ? "" : value)}>
            <SelectTrigger className="w-48">
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
          <Label>Conductor</Label>
          <Select value={driverFilter || "ALL"} onValueChange={(value) => setDriverFilter(value === "ALL" ? "" : value)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos los conductores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los conductores</SelectItem>
              {allDrivers.map((driver) => (
                <SelectItem key={driver.id} value={driver.id}>
                  {driver.firstName} {driver.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Vehiculo</Label>
          <Select value={vehicleFilter || "ALL"} onValueChange={(value) => setVehicleFilter(value === "ALL" ? "" : value)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Todos los vehiculos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los vehiculos</SelectItem>
              {allVehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate}
                </SelectItem>
              ))}
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
        ) : trips.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Route} title="Sin viajes registrados" description="Crea el primer viaje asignando conductor y vehiculo." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Ruta</TableHead>
                <TableHead>Conductor</TableHead>
                <TableHead>Vehiculo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell className="font-medium">#{trip.sequentialNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{trip.project.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {trip.originSite.name} → {trip.destinationSite.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {trip.driver.firstName} {trip.driver.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{trip.vehicle.plate}</TableCell>
                  <TableCell>
                    <StatusBadge status={trip.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild aria-label="Ver detalle">
                      <Link href={`/trips/${trip.id}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
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
            <DialogTitle>Nuevo viaje</DialogTitle>
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
                <Label>Origen (cargue)</Label>
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
                <Label>Destino (descargue)</Label>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Conductor</Label>
                <Select value={watch("driverId")} onValueChange={(value) => setValue("driverId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un conductor" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.firstName} {driver.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.driverId && <p className="text-xs text-destructive">{errors.driverId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Vehiculo</Label>
                <Select value={watch("vehicleId")} onValueChange={(value) => setValue("vehicleId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un vehiculo" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.plate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.vehicleId && <p className="text-xs text-destructive">{errors.vehicleId.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="estimatedQuantity">Cantidad estimada (opcional)</Label>
                <Input id="estimatedQuantity" type="number" step="0.01" {...register("estimatedQuantity")} />
              </div>
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Select
                  value={watch("quantityUnit")}
                  onValueChange={(value) => setValue("quantityUnit", value as CreateTripInput["quantityUnit"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TON">Toneladas</SelectItem>
                    <SelectItem value="CUBIC_METER">Metros cubicos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              El viaje se crea directamente en estado &quot;Asignado&quot;. Requiere una tarifa vigente configurada
              para esta obra, ruta, material y (propietario o tipo de vehiculo).
            </p>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Creando..." : "Crear viaje"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
