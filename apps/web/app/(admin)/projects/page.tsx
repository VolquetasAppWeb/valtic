"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { HardHat, MapPin, Pencil, Trash2 } from "lucide-react";
import { projectSchema, type ProjectInput } from "@valtic/validation";
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
import { RowActionsMenu, type RowAction } from "@/components/admin/row-actions-menu";
import { apiClient, ApiError } from "@/lib/api-client";
import { useIsMobile } from "@/hooks/use-media-query";
import type { PaginatedResult, Project } from "@/lib/api-types";

const STATUS_OPTIONS = ["PLANNED", "ACTIVE", "PAUSED", "CLOSED"] as const;

export default function ProjectsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const projectParams = new URLSearchParams({ pageSize: "100" });
  if (appliedSearch) projectParams.set("search", appliedSearch);
  if (statusFilter) projectParams.set("status", statusFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", appliedSearch, statusFilter],
    queryFn: () => apiClient.get<PaginatedResult<Project>>(`/projects?${projectParams.toString()}`),
    refetchInterval: 15_000,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectInput>({ resolver: zodResolver(projectSchema) });

  function openEdit(project: Project): void {
    setEditing(project);
    setFormError(null);
    reset({
      name: project.name,
      code: project.code,
      description: project.description ?? "",
      clientName: project.clientName ?? "",
      startDate: project.startDate.slice(0, 10),
      endDate: project.endDate?.slice(0, 10) ?? "",
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: ProjectInput) => {
      const payload = { ...values, description: values.description || undefined, endDate: values.endDate || undefined };
      return apiClient.patch<Project>(`/projects/${editing!.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDialogOpen(false);
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.response.message : "No se pudo guardar la obra.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: (typeof STATUS_OPTIONS)[number] }) =>
      apiClient.patch<Project>(`/projects/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.delete<void>(`/projects/${id}`, { body: reason ? { reason } : {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["operational-sites"] });
      queryClient.invalidateQueries({ queryKey: ["rates"] });
      setDeleteTarget(null);
      setDeleteReason("");
      setDeleteError(null);
    },
    onError: (error: unknown) => {
      setDeleteError(error instanceof ApiError ? error.response.message : "No se pudo eliminar la obra.");
    },
  });

  const projects = data?.data ?? [];

  function projectActions(project: Project): RowAction[] {
    return [
      {
        label: "Puntos operativos",
        icon: <MapPin className="h-4 w-4" />,
        onClick: () => router.push(`/operations?tab=sitios&projectId=${project.id}`),
      },
      { label: "Editar", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(project) },
      {
        label: "Eliminar",
        icon: <Trash2 className="h-4 w-4" />,
        destructive: true,
        onClick: () => {
          setDeleteTarget(project);
          setDeleteReason("");
          setDeleteError(null);
        },
      },
    ];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Obras</h1>
        <p className="text-sm text-muted-foreground">Proyectos u obras donde se ejecutan los viajes.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="project-search">Buscar</Label>
          <Input
            id="project-search"
            placeholder="Nombre, codigo o cliente..."
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
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
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
        ) : projects.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={HardHat} title="Sin obras registradas" description="Crea la primera obra para configurar sus puntos operativos." />
          </div>
        ) : isMobile ? (
          <div className="divide-y divide-border">
            {projects.map((project) => (
              <div key={project.id} className="space-y-2 p-4">
                <p className="text-lg font-bold">{project.name}</p>
                <p className="text-sm text-muted-foreground">Codigo: {project.code}</p>
                <p className="text-sm text-muted-foreground">Cliente: {project.clientName || "—"}</p>
                <p className="text-sm text-muted-foreground">Puntos operativos: {project._count?.operationalSites ?? 0}</p>
                <Select
                  value={project.status}
                  onValueChange={(status) => statusMutation.mutate({ id: project.id, status: status as (typeof STATUS_OPTIONS)[number] })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      <StatusBadge status={project.status} />
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="pt-1">
                  <RowActionsMenu actions={projectActions(project)} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Codigo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Puntos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell className="text-muted-foreground">{project.code}</TableCell>
                  <TableCell className="text-muted-foreground">{project.clientName || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{project._count?.operationalSites ?? 0}</TableCell>
                  <TableCell>
                    <Select
                      value={project.status}
                      onValueChange={(status) => statusMutation.mutate({ id: project.id, status: status as (typeof STATUS_OPTIONS)[number] })}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue>
                          <StatusBadge status={project.status} />
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActionsMenu actions={projectActions(project)} />
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
            <DialogTitle>{editing ? "Editar obra" : "Nueva obra"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit((values) => saveMutation.mutate(values))}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code">Codigo</Label>
                <Input id="code" {...register("code")} />
                {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientName">Cliente (opcional)</Label>
              <Input id="clientName" {...register("clientName")} />
              {errors.clientName && <p className="text-xs text-destructive">{errors.clientName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Descripcion (opcional)</Label>
              <Textarea id="description" {...register("description")} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Fecha de inicio</Label>
                <Input id="startDate" type="date" {...register("startDate")} />
                {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">Fecha de fin (opcional)</Label>
                <Input id="endDate" type="date" {...register("endDate")} />
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar obra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vas a eliminar la obra <span className="font-medium text-foreground">{deleteTarget?.name}</span>. Sus
              puntos operativos y tarifas tambien se eliminaran. Se bloquea si tiene viajes en curso.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="project-delete-reason">Motivo (opcional)</Label>
              <Textarea
                id="project-delete-reason"
                rows={2}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Por que se elimina esta obra..."
              />
            </div>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, reason: deleteReason })}
              >
                {deleteMutation.isPending ? "Eliminando..." : "Eliminar obra"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
