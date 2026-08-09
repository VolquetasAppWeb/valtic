"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, KeyRound, Pencil, Plus, Power, PowerOff, Trash2, Users } from "lucide-react";
import { PERMISSIONS } from "@valtic/types";
import { driverSchema, type DriverInput } from "@valtic/validation";
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
import { usePermissions } from "@/hooks/use-permissions";
import type { DeletedDriver, Driver, PaginatedResult } from "@/lib/api-types";

export default function DriversPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canSeeDeletedLog = has([PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pinDialogDriver, setPinDialogDriver] = useState<Driver | null>(null);
  const [newPin, setNewPin] = useState("");
  const [editing, setEditing] = useState<Driver | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedLogOpen, setDeletedLogOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const params = new URLSearchParams({ pageSize: "100" });
  if (appliedSearch) params.set("search", appliedSearch);
  if (statusFilter) params.set("status", statusFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["drivers", appliedSearch, statusFilter],
    queryFn: () => apiClient.get<PaginatedResult<Driver>>(`/drivers?${params.toString()}`),
    refetchInterval: 15_000,
  });

  const { data: deletedData, isLoading: loadingDeleted } = useQuery({
    queryKey: ["drivers", "deleted"],
    queryFn: () => apiClient.get<PaginatedResult<DeletedDriver>>("/drivers/deleted?pageSize=100"),
    enabled: deletedLogOpen && canSeeDeletedLog,
  });

  const activeForm = useForm<DriverInput>({ resolver: zodResolver(driverSchema), defaultValues: { documentType: "CC" } });

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    activeForm.reset({ documentType: "CC", documentNumber: "", firstName: "", lastName: "", phone: "", licenseNumber: "", licenseExpiration: "", pin: "" });
    setDialogOpen(true);
  }

  function openEdit(driver: Driver): void {
    setEditing(driver);
    setFormError(null);
    // El PIN no se edita aqui (usa "Restablecer PIN"); se completa con un
    // valor dummy solo para satisfacer la validacion del formulario, y se
    // descarta antes de enviar el PATCH.
    activeForm.reset({
      documentType: driver.documentType,
      documentNumber: driver.documentNumber,
      firstName: driver.firstName,
      lastName: driver.lastName,
      phone: driver.phone,
      licenseNumber: driver.licenseNumber,
      licenseExpiration: driver.licenseExpiration.slice(0, 10),
      pin: "000000",
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: DriverInput) => {
      if (editing) {
        const { pin: _pin, ...updatePayload } = values;
        return apiClient.patch<Driver>(`/drivers/${editing.id}`, updatePayload);
      }
      return apiClient.post<Driver>("/drivers", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setDialogOpen(false);
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.response.message : "No se pudo guardar el conductor.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      apiClient.patch<Driver>(`/drivers/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["drivers"] }),
  });

  const resetPinMutation = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) =>
      apiClient.patch<Driver>(`/drivers/${id}/reset-pin`, { newPin: pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setPinDialogDriver(null);
      setNewPin("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.delete<void>(`/drivers/${id}`, { body: reason ? { reason } : {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setDeleteTarget(null);
      setDeleteReason("");
      setDeleteError(null);
    },
    onError: (error: unknown) => {
      setDeleteError(error instanceof ApiError ? error.response.message : "No se pudo eliminar el conductor.");
    },
  });

  const drivers = data?.data ?? [];
  const deletedDrivers = deletedData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conductores</h1>
          <p className="text-sm text-muted-foreground">Conductores registrados en la empresa.</p>
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
            Nuevo conductor
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="driver-search">Buscar</Label>
          <Input
            id="driver-search"
            placeholder="Nombre o documento..."
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
              <SelectItem value="INACTIVE">Inactivo</SelectItem>
              <SelectItem value="SUSPENDED">Suspendido</SelectItem>
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
        ) : drivers.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Users} title="Sin conductores" description="No hay conductores que coincidan con estos filtros." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Vehiculo actual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((driver) => {
                const currentVehicle = driver.assignments?.find((a) => a.active)?.vehicle;
                return (
                  <TableRow key={driver.id}>
                    <TableCell className="font-medium">
                      {driver.firstName} {driver.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{driver.documentNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{driver.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{currentVehicle?.plate ?? "Sin asignar"}</TableCell>
                    <TableCell>
                      <StatusBadge status={driver.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(driver)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Restablecer PIN"
                          onClick={() => {
                            setPinDialogDriver(driver);
                            setNewPin("");
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={driver.status === "ACTIVE" ? "Desactivar" : "Activar"}
                          onClick={() =>
                            statusMutation.mutate({ id: driver.id, status: driver.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
                          }
                        >
                          {driver.status === "ACTIVE" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Eliminar"
                          onClick={() => {
                            setDeleteTarget(driver);
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
            <DialogTitle>{editing ? "Editar conductor" : "Nuevo conductor"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={activeForm.handleSubmit((values) => saveMutation.mutate(values))}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de documento</Label>
                <Select
                  value={activeForm.watch("documentType")}
                  onValueChange={(value) => activeForm.setValue("documentType", value as DriverInput["documentType"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CC">Cedula de ciudadania</SelectItem>
                    <SelectItem value="CE">Cedula de extranjeria</SelectItem>
                    <SelectItem value="PASSPORT">Pasaporte</SelectItem>
                    <SelectItem value="NIT">NIT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="documentNumber">Numero de documento</Label>
                <Input id="documentNumber" {...activeForm.register("documentNumber")} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">Nombres</Label>
                <Input id="firstName" {...activeForm.register("firstName")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Apellidos</Label>
                <Input id="lastName" {...activeForm.register("lastName")} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefono</Label>
                <Input id="phone" {...activeForm.register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="licenseNumber">Licencia</Label>
                <Input id="licenseNumber" {...activeForm.register("licenseNumber")} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="licenseExpiration">Vencimiento licencia</Label>
                <Input id="licenseExpiration" type="date" {...activeForm.register("licenseExpiration")} />
              </div>
              {!editing && (
                <div className="space-y-1.5">
                  <Label htmlFor="pin">PIN inicial (6 digitos)</Label>
                  <Input id="pin" inputMode="numeric" maxLength={6} {...activeForm.register("pin")} />
                </div>
              )}
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

      <Dialog open={!!pinDialogDriver} onOpenChange={(open) => !open && setPinDialogDriver(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restablecer PIN</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Nuevo PIN para {pinDialogDriver?.firstName} {pinDialogDriver?.lastName}. Se limpian los bloqueos por
              intentos fallidos.
            </p>
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="654321"
              value={newPin}
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))}
            />
            <DialogFooter>
              <Button
                disabled={newPin.length !== 6 || resetPinMutation.isPending}
                onClick={() => pinDialogDriver && resetPinMutation.mutate({ id: pinDialogDriver.id, pin: newPin })}
              >
                {resetPinMutation.isPending ? "Guardando..." : "Restablecer PIN"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar conductor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vas a eliminar a <span className="font-medium text-foreground">{deleteTarget?.firstName} {deleteTarget?.lastName}</span>.
              No podra iniciar sesion ni ser asignado a nuevos viajes. Esta accion queda registrada en el historial
              {canSeeDeletedLog ? "" : " y solo la puede consultar un administrador"}. Se bloquea si tiene viajes en curso.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="delete-reason">Motivo (opcional)</Label>
              <Textarea
                id="delete-reason"
                rows={2}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Por que se elimina este conductor..."
              />
            </div>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, reason: deleteReason })}
              >
                {deleteMutation.isPending ? "Eliminando..." : "Eliminar conductor"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deletedLogOpen} onOpenChange={setDeletedLogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Conductores eliminados</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Historial de eliminaciones de conductores hechas por cualquier despachador de la empresa. Solo visible
              para administradores.
            </p>
            {loadingDeleted ? (
              <Skeleton className="h-40 w-full" />
            ) : deletedDrivers.length === 0 ? (
              <EmptyState icon={Archive} title="Sin eliminaciones" description="Ningun conductor ha sido eliminado todavia." />
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Eliminado</TableHead>
                      <TableHead>Por</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedDrivers.map((driver) => (
                      <TableRow key={driver.id}>
                        <TableCell className="font-medium">
                          {driver.firstName} {driver.lastName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{driver.documentNumber}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(driver.deletedAt).toLocaleString("es-CO")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {driver.deletedBy ? `${driver.deletedBy.firstName} ${driver.deletedBy.lastName}` : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{driver.deleteReason ?? "—"}</TableCell>
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
