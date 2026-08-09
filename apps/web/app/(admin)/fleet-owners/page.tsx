"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { fleetOwnerSchema, type FleetOwnerInput } from "@valtic/validation";
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
import type { AdminUser, FleetOwner, PaginatedResult } from "@/lib/api-types";

const TYPE_LABEL: Record<string, string> = { NATURAL_PERSON: "Persona natural", LEGAL_ENTITY: "Persona juridica" };

export default function FleetOwnersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FleetOwner | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dispatcherId, setDispatcherId] = useState("");

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const ownerParams = new URLSearchParams({ pageSize: "100" });
  if (appliedSearch) ownerParams.set("search", appliedSearch);
  if (statusFilter) ownerParams.set("status", statusFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["fleet-owners", appliedSearch, statusFilter],
    queryFn: () => apiClient.get<PaginatedResult<FleetOwner>>(`/fleet-owners?${ownerParams.toString()}`),
    refetchInterval: 15_000,
  });

  const { data: usersData } = useQuery({
    queryKey: ["users", "for-select"],
    queryFn: () => apiClient.get<AdminUser[]>("/users"),
  });
  const dispatchers = (usersData ?? []).filter((u) => u.userRoles.some((ur) => ur.role.name === "DISPATCHER"));

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FleetOwnerInput>({ resolver: zodResolver(fleetOwnerSchema), defaultValues: { type: "NATURAL_PERSON" } });

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    setDispatcherId("");
    reset({ type: "NATURAL_PERSON", documentNumber: "", name: "", phone: "", email: "", bankName: "", bankAccountType: "", bankAccountLastFour: "" });
    setDialogOpen(true);
  }

  function openEdit(owner: FleetOwner): void {
    setEditing(owner);
    setFormError(null);
    setDispatcherId(owner.dispatcherId ?? "");
    reset({
      type: owner.type,
      documentNumber: owner.documentNumber,
      name: owner.name,
      phone: owner.phone,
      email: owner.email ?? "",
      bankName: owner.bankName ?? "",
      bankAccountType: owner.bankAccountType ?? "",
      bankAccountLastFour: owner.bankAccountLastFour ?? "",
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: FleetOwnerInput) => {
      const payload = {
        ...values,
        email: values.email || undefined,
        bankName: values.bankName || undefined,
        bankAccountType: values.bankAccountType || undefined,
        bankAccountLastFour: values.bankAccountLastFour || undefined,
        dispatcherId: editing ? dispatcherId || null : dispatcherId || undefined,
      };
      return editing
        ? apiClient.patch<FleetOwner>(`/fleet-owners/${editing.id}`, payload)
        : apiClient.post<FleetOwner>("/fleet-owners", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fleet-owners"] });
      setDialogOpen(false);
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.response.message : "No se pudo guardar el propietario.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      apiClient.patch<FleetOwner>(`/fleet-owners/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fleet-owners"] }),
  });

  const owners = data?.data ?? [];
  const typeValue = watch("type");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Propietarios</h1>
          <p className="text-sm text-muted-foreground">Propietarios de la flota de vehiculos.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo propietario
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="owner-search">Buscar</Label>
          <Input
            id="owner-search"
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
        ) : owners.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Building2} title="Sin propietarios registrados" description="Registra el primer propietario de flota." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Despachador asignado</TableHead>
                <TableHead>Vehiculos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.map((owner) => (
                <TableRow key={owner.id}>
                  <TableCell className="font-medium">{owner.name}</TableCell>
                  <TableCell className="text-muted-foreground">{owner.documentNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{TYPE_LABEL[owner.type]}</TableCell>
                  <TableCell className="text-muted-foreground">{owner.phone}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {owner.dispatcher ? `${owner.dispatcher.firstName} ${owner.dispatcher.lastName}` : "Sin asignar"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{owner._count?.vehicles ?? 0}</TableCell>
                  <TableCell>
                    <StatusBadge status={owner.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(owner)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={owner.status === "ACTIVE" ? "Desactivar" : "Activar"}
                        onClick={() =>
                          statusMutation.mutate({ id: owner.id, status: owner.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
                        }
                      >
                        {owner.status === "ACTIVE" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </Button>
                    </div>
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
            <DialogTitle>{editing ? "Editar propietario" : "Nuevo propietario"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit((values) => saveMutation.mutate(values))}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={typeValue} onValueChange={(value) => setValue("type", value as FleetOwnerInput["type"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NATURAL_PERSON">Persona natural</SelectItem>
                    <SelectItem value="LEGAL_ENTITY">Persona juridica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="documentNumber">Documento</Label>
                <Input id="documentNumber" {...register("documentNumber")} />
                {errors.documentNumber && <p className="text-xs text-destructive">{errors.documentNumber.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre / razon social</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefono</Label>
                <Input id="phone" {...register("phone")} />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Correo (opcional)</Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Despachador asignado</Label>
              <Select value={dispatcherId || "NONE"} onValueChange={(value) => setDispatcherId(value === "NONE" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sin asignar (solo lo ve el administrador)</SelectItem>
                  {dispatchers.map((dispatcher) => (
                    <SelectItem key={dispatcher.id} value={dispatcher.id}>
                      {dispatcher.firstName} {dispatcher.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Solo el despachador asignado (y el administrador) podra ver y usar este propietario al crear vehiculos.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="bankName">Banco</Label>
                <Input id="bankName" {...register("bankName")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankAccountType">Tipo cuenta</Label>
                <Input id="bankAccountType" placeholder="SAVINGS" {...register("bankAccountType")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankAccountLastFour">Ultimos 4 digitos</Label>
                <Input id="bankAccountLastFour" maxLength={4} {...register("bankAccountLastFour")} />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                {saveMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
