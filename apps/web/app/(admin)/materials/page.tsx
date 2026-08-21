"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Package, Pencil, Plus, PowerOff, Power, Trash2 } from "lucide-react";
import { materialSchema, type MaterialInput } from "@valtic/validation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/status-badge";
import { apiClient, ApiError } from "@/lib/api-client";
import type { Material, PaginatedResult } from "@/lib/api-types";

export default function MaterialsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const materialParams = new URLSearchParams({ pageSize: "100" });
  if (appliedSearch) materialParams.set("search", appliedSearch);
  if (statusFilter) materialParams.set("status", statusFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["materials", appliedSearch, statusFilter],
    queryFn: () => apiClient.get<PaginatedResult<Material>>(`/materials?${materialParams.toString()}`),
    refetchInterval: 15_000,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MaterialInput>({ resolver: zodResolver(materialSchema) });

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    reset({ name: "", code: "", unit: "" });
    setDialogOpen(true);
  }

  function openEdit(material: Material): void {
    setEditing(material);
    setFormError(null);
    reset({ name: material.name, code: material.code, unit: material.unit });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: MaterialInput) =>
      editing
        ? apiClient.patch<Material>(`/materials/${editing.id}`, values)
        : apiClient.post<Material>("/materials", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      setDialogOpen(false);
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.response.message : "No se pudo guardar el material.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      apiClient.patch<Material>(`/materials/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["materials"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.delete<void>(`/materials/${id}`, { body: reason ? { reason } : {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      setDeleteTarget(null);
      setDeleteReason("");
      setDeleteError(null);
    },
    onError: (error: unknown) => {
      setDeleteError(error instanceof ApiError ? error.response.message : "No se pudo eliminar el material.");
    },
  });

  const materials = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Materiales</h1>
          <p className="text-sm text-muted-foreground">Catalogo de materiales transportados en las obras.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo material
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="material-search">Buscar</Label>
          <Input
            id="material-search"
            placeholder="Nombre o codigo..."
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
            <Skeleton className="h-10 w-full" />
          </div>
        ) : materials.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Package}
              title="Sin materiales registrados"
              description="Crea el primer material para poder usarlo en tarifas y viajes."
              action={
                <Button variant="outline" onClick={openCreate} className="mt-2">
                  Crear material
                </Button>
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Codigo</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((material) => (
                <TableRow key={material.id}>
                  <TableCell className="font-medium">{material.name}</TableCell>
                  <TableCell className="text-muted-foreground">{material.code}</TableCell>
                  <TableCell className="text-muted-foreground">{material.unit}</TableCell>
                  <TableCell>
                    <StatusBadge status={material.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(material)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={material.status === "ACTIVE" ? "Desactivar" : "Activar"}
                        onClick={() =>
                          statusMutation.mutate({
                            id: material.id,
                            status: material.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                          })
                        }
                      >
                        {material.status === "ACTIVE" ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() => {
                          setDeleteTarget(material);
                          setDeleteReason("");
                          setDeleteError(null);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
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
            <DialogTitle>{editing ? "Editar material" : "Nuevo material"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit((values) => saveMutation.mutate(values))}>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="code">Codigo</Label>
                <Input id="code" {...register("code")} />
                {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit">Unidad</Label>
                <Input id="unit" placeholder="m3, ton..." {...register("unit")} />
                {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar material</DialogTitle>
            <DialogDescription>
              Vas a eliminar <span className="font-medium text-foreground">{deleteTarget?.name}</span>. Las tarifas y
              viajes que ya lo usaron mantienen su historial intacto; el material solo deja de estar disponible para
              elegirlo en tarifas o viajes nuevos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="material-delete-reason">Motivo (opcional)</Label>
            <Textarea
              id="material-delete-reason"
              rows={2}
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
          </div>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, reason: deleteReason })}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
