"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Pencil, Plus, Power, PowerOff, Trash2, Truck, UserCog } from "lucide-react";
import { PERMISSIONS } from "@valtic/types";
import { vehicleSchema, type VehicleInput } from "@valtic/validation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/status-badge";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { usePermissions } from "@/hooks/use-permissions";
import type { DeletedVehicle, Driver, FleetOwner, PaginatedResult, Vehicle } from "@/lib/api-types";

const VEHICLE_TYPE_LABEL: Record<string, string> = {
  DUMP_TRUCK: "Volqueta",
  DOUBLE_TRAILER: "Doble troque",
  MINI_DUMP_TRUCK: "Mini volqueta",
  TRACTOR_TRAILER: "Tractomula",
  OTHER: "Otro",
};

export default function VehiclesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const { has } = usePermissions();
  const isDispatcher = !!currentUser?.roles.includes("DISPATCHER") && !currentUser?.roles.includes("TENANT_ADMIN");
  const canSeeDeletedLog = has([PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [assignDialogVehicle, setAssignDialogVehicle] = useState<Vehicle | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedLogOpen, setDeletedLogOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const vehicleParams = new URLSearchParams({ pageSize: "100" });
  if (appliedSearch) vehicleParams.set("search", appliedSearch);
  if (statusFilter) vehicleParams.set("status", statusFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["vehicles", appliedSearch, statusFilter],
    queryFn: () => apiClient.get<PaginatedResult<Vehicle>>(`/vehicles?${vehicleParams.toString()}`),
    refetchInterval: 15_000,
  });

  const { data: ownersData } = useQuery({
    queryKey: ["fleet-owners", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<FleetOwner>>("/fleet-owners?pageSize=100"),
  });

  const { data: driversData } = useQuery({
    queryKey: ["drivers", "for-select"],
    queryFn: () => apiClient.get<PaginatedResult<Driver>>("/drivers?pageSize=100"),
    enabled: !!assignDialogVehicle,
  });

  const { data: deletedData, isLoading: loadingDeleted } = useQuery({
    queryKey: ["vehicles", "deleted"],
    queryFn: () => apiClient.get<PaginatedResult<DeletedVehicle>>("/vehicles/deleted?pageSize=100"),
    enabled: deletedLogOpen && canSeeDeletedLog,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<VehicleInput>({ resolver: zodResolver(vehicleSchema) });

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    const owners = ownersData?.data ?? [];
    const selfOwnerId = isDispatcher ? (owners.find((o) => o.userId === currentUser?.id)?.id ?? "") : "";
    reset({
      fleetOwnerId: selfOwnerId,
      plate: "",
      vehicleType: "DUMP_TRUCK",
      brand: "",
      model: "",
      year: new Date().getFullYear(),
      capacity: 0,
      capacityUnit: "TON",
    });
    setDialogOpen(true);
  }

  function openEdit(vehicle: Vehicle): void {
    setEditing(vehicle);
    setFormError(null);
    reset({
      fleetOwnerId: vehicle.fleetOwnerId,
      plate: vehicle.plate,
      vehicleType: vehicle.vehicleType,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      capacity: Number(vehicle.capacity),
      capacityUnit: vehicle.capacityUnit,
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: VehicleInput) => {
      const payload = { ...values, fleetOwnerId: values.fleetOwnerId || undefined };
      return editing
        ? apiClient.patch<Vehicle>(`/vehicles/${editing.id}`, payload)
        : apiClient.post<Vehicle>("/vehicles", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setDialogOpen(false);
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.response.message : "No se pudo guardar el vehiculo.");
    },
  });

  function onSubmit(values: VehicleInput): void {
    if (!isDispatcher && !values.fleetOwnerId) {
      setFormError("Selecciona un propietario.");
      return;
    }
    setFormError(null);
    saveMutation.mutate(values);
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "MAINTENANCE" | "INACTIVE" }) =>
      apiClient.patch<Vehicle>(`/vehicles/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ driverId, vehicleId }: { driverId: string; vehicleId: string }) =>
      apiClient.post("/driver-vehicle-assignments", { driverId, vehicleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setAssignDialogVehicle(null);
      setSelectedDriverId("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.delete<void>(`/vehicles/${id}`, { body: reason ? { reason } : {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setDeleteTarget(null);
      setDeleteReason("");
      setDeleteError(null);
    },
    onError: (error: unknown) => {
      setDeleteError(error instanceof ApiError ? error.response.message : "No se pudo eliminar el vehiculo.");
    },
  });

  const vehicles = data?.data ?? [];
  const deletedVehicles = deletedData?.data ?? [];
  const owners = ownersData?.data ?? [];
  const drivers = driversData?.data ?? [];
  const fleetOwnerId = watch("fleetOwnerId");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehiculos</h1>
          <p className="text-sm text-muted-foreground">Flota de vehiculos registrada en la empresa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSeeDeletedLog && (
            <Button variant="outline" onClick={() => setDeletedLogOpen(true)}>
              <Archive className="h-4 w-4" />
              Ver eliminados
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo vehiculo
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="vehicle-search">Buscar</Label>
          <Input
            id="vehicle-search"
            placeholder="Placa, marca o modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAppliedSearch(search)}
            className="w-56"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="ACTIVE">Activo</SelectItem>
              <SelectItem value="MAINTENANCE">En mantenimiento</SelectItem>
              <SelectItem value="INACTIVE">Inactivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => setAppliedSearch(search)}>
          Filtrar
        </Button>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : vehicles.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Truck} title="Sin vehiculos registrados" description="Registra el primer vehiculo de la flota." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Marca/Modelo</TableHead>
                <TableHead>Capacidad</TableHead>
                <TableHead>Propietario</TableHead>
                <TableHead>Conductor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((vehicle) => {
                const currentDriver = vehicle.assignments?.find((a) => a.active)?.driver;
                return (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">{vehicle.plate}</TableCell>
                    <TableCell className="text-muted-foreground">{VEHICLE_TYPE_LABEL[vehicle.vehicleType]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {vehicle.brand} {vehicle.model} ({vehicle.year})
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {vehicle.capacity} {vehicle.capacityUnit === "TON" ? "ton" : "m3"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{vehicle.fleetOwner?.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {currentDriver ? `${currentDriver.firstName} ${currentDriver.lastName}` : "Sin asignar"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={vehicle.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Asignar conductor"
                          onClick={() => setAssignDialogVehicle(vehicle)}
                        >
                          <UserCog className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(vehicle)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={vehicle.status === "ACTIVE" ? "Desactivar" : "Activar"}
                          onClick={() =>
                            statusMutation.mutate({ id: vehicle.id, status: vehicle.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
                          }
                        >
                          {vehicle.status === "ACTIVE" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Eliminar"
                          onClick={() => {
                            setDeleteTarget(vehicle);
                            setDeleteReason("");
                            setDeleteError(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar vehiculo" : "Nuevo vehiculo"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Propietario</Label>
                <Select value={fleetOwnerId} onValueChange={(value) => setValue("fleetOwnerId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un propietario" />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.name}
                        {owner.userId === currentUser?.id ? " (Tú)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isDispatcher && (
                  <p className="text-xs text-muted-foreground">
                    Por defecto queda a tu nombre; solo cambialo si el vehiculo es de otro propietario.
                  </p>
                )}
                {errors.fleetOwnerId && <p className="text-xs text-destructive">{errors.fleetOwnerId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plate">Placa</Label>
                <Input id="plate" {...register("plate")} />
                {errors.plate && <p className="text-xs text-destructive">{errors.plate.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de vehiculo</Label>
              <Select
                value={watch("vehicleType")}
                onValueChange={(value) => setValue("vehicleType", value as VehicleInput["vehicleType"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(VEHICLE_TYPE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="brand">Marca</Label>
                <Input id="brand" {...register("brand")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model">Modelo</Label>
                <Input id="model" {...register("model")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="year">Ano</Label>
                <Input id="year" type="number" {...register("year")} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="capacity">Capacidad</Label>
                <Input id="capacity" type="number" step="0.01" {...register("capacity")} />
              </div>
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Select
                  value={watch("capacityUnit")}
                  onValueChange={(value) => setValue("capacityUnit", value as VehicleInput["capacityUnit"])}
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
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignDialogVehicle} onOpenChange={(open) => !open && setAssignDialogVehicle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar conductor a {assignDialogVehicle?.plate}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un conductor" />
              </SelectTrigger>
              <SelectContent>
                {drivers
                  .filter((driver) => driver.status === "ACTIVE")
                  .map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.firstName} {driver.lastName} ({driver.documentNumber})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button
                disabled={!selectedDriverId || assignMutation.isPending}
                onClick={() =>
                  assignDialogVehicle &&
                  assignMutation.mutate({ driverId: selectedDriverId, vehicleId: assignDialogVehicle.id })
                }
              >
                {assignMutation.isPending ? "Asignando..." : "Asignar"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar vehiculo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vas a eliminar el vehiculo <span className="font-medium text-foreground">{deleteTarget?.plate}</span>.
              No podra ser asignado a nuevos viajes. Esta accion queda registrada en el historial
              {canSeeDeletedLog ? "" : " y solo la puede consultar un administrador"}. Se bloquea si tiene viajes en
              curso.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="vehicle-delete-reason">Motivo (opcional)</Label>
              <Textarea
                id="vehicle-delete-reason"
                rows={2}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Por que se elimina este vehiculo..."
              />
            </div>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, reason: deleteReason })}
              >
                {deleteMutation.isPending ? "Eliminando..." : "Eliminar vehiculo"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deletedLogOpen} onOpenChange={setDeletedLogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vehiculos eliminados</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Historial de eliminaciones de vehiculos hechas por cualquier despachador de la empresa. Solo visible
              para administradores.
            </p>
            {loadingDeleted ? (
              <Skeleton className="h-40 w-full" />
            ) : deletedVehicles.length === 0 ? (
              <EmptyState icon={Archive} title="Sin eliminaciones" description="Ningun vehiculo ha sido eliminado todavia." />
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Placa</TableHead>
                      <TableHead>Marca/Modelo</TableHead>
                      <TableHead>Eliminado</TableHead>
                      <TableHead>Por</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedVehicles.map((vehicle) => (
                      <TableRow key={vehicle.id}>
                        <TableCell className="font-medium">{vehicle.plate}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {vehicle.brand} {vehicle.model}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(vehicle.deletedAt).toLocaleString("es-CO")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {vehicle.deletedBy ? `${vehicle.deletedBy.firstName} ${vehicle.deletedBy.lastName}` : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{vehicle.deleteReason ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
