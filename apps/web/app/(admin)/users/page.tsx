"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Archive, BarChart3, Plus, Power, PowerOff, Trash2, UserCog } from "lucide-react";
import { PERMISSIONS } from "@valtic/types";
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
import { useAuthStore } from "@/stores/auth-store";
import { usePermissions } from "@/hooks/use-permissions";
import type { AdminUser, DeletedUser, PaginatedResult } from "@/lib/api-types";

interface DispatcherStats {
  tripsTotal: number;
  tripsCompleted: number;
  vehiclesCount: number;
  moneyPaid: string;
  moneyPendingSettlement: string;
}

const money = (value: string | number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value));

const ROLE_LABEL: Record<string, string> = { TENANT_ADMIN: "Administrador", DISPATCHER: "Despachador" };

const userSchema = z.object({
  firstName: z.string().min(2, "Minimo 2 caracteres"),
  lastName: z.string().min(2, "Minimo 2 caracteres"),
  email: z.string().email("Correo invalido"),
  phone: z.string().optional(),
  password: z.string().min(8, "Minimo 8 caracteres"),
  roleName: z.enum(["TENANT_ADMIN", "DISPATCHER"]),
});

type UserInput = z.infer<typeof userSchema>;

export default function UsersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { has } = usePermissions();
  const canSeeDeletedLog = has([PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [statsTarget, setStatsTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedLogOpen, setDeletedLogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiClient.get<AdminUser[]>("/users"),
    refetchInterval: 15_000,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserInput>({ resolver: zodResolver(userSchema), defaultValues: { roleName: "DISPATCHER" } });

  function openCreate(): void {
    setFormError(null);
    reset({ firstName: "", lastName: "", email: "", phone: "", password: "", roleName: "DISPATCHER" });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (values: UserInput) => apiClient.post<AdminUser>("/users", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.response.message : "No se pudo crear el usuario.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      apiClient.patch<AdminUser>(`/users/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const { data: dispatcherStats, isFetching: loadingStats } = useQuery({
    queryKey: ["users", "stats", statsTarget?.id],
    queryFn: () => apiClient.get<DispatcherStats>(`/users/${statsTarget!.id}/stats`),
    enabled: !!statsTarget,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.delete<void>(`/users/${id}`, { body: reason ? { reason } : {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeleteTarget(null);
      setDeleteReason("");
      setDeleteError(null);
    },
    onError: (error: unknown) => {
      setDeleteError(error instanceof ApiError ? error.response.message : "No se pudo eliminar el usuario.");
    },
  });

  const { data: deletedData, isLoading: loadingDeleted } = useQuery({
    queryKey: ["users", "deleted"],
    queryFn: () => apiClient.get<PaginatedResult<DeletedUser>>("/users/deleted?pageSize=100"),
    enabled: deletedLogOpen && canSeeDeletedLog,
  });
  const deletedUsers = deletedData?.data ?? [];

  const normalizedSearch = search.trim().toLowerCase();
  const users = (data ?? []).filter((user) => {
    const matchesSearch =
      !normalizedSearch ||
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(normalizedSearch) ||
      user.email.toLowerCase().includes(normalizedSearch);
    const matchesRole = !roleFilter || user.userRoles.some((ur) => ur.role.name === roleFilter);
    const matchesStatus = !statusFilter || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Cuentas administrativas de la empresa: administradores y despachadores.
          </p>
        </div>
        <div className="flex gap-2">
          {canSeeDeletedLog && (
            <Button variant="outline" onClick={() => setDeletedLogOpen(true)}>
              <Archive className="h-4 w-4" />
              Ver eliminados
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo usuario
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="user-search">Buscar</Label>
          <Input
            id="user-search"
            placeholder="Nombre o correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Rol</Label>
          <Select value={roleFilter || "ALL"} onValueChange={(v) => setRoleFilter(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos los roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los roles</SelectItem>
              <SelectItem value="TENANT_ADMIN">Administrador</SelectItem>
              <SelectItem value="DISPATCHER">Despachador</SelectItem>
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
              <SelectItem value="ACTIVE">Activo</SelectItem>
              <SelectItem value="INACTIVE">Inactivo</SelectItem>
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
        ) : users.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={UserCog} title="Sin usuarios" description="Crea el primer administrador o despachador." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Ultimo ingreso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.userRoles.map((ur) => ROLE_LABEL[ur.role.name] ?? ur.role.name).join(", ")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-CO") : "Nunca"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {user.userRoles.some((ur) => ur.role.name === "DISPATCHER") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Ver estadisticas"
                          title="Ver estadisticas del despachador"
                          onClick={() => setStatsTarget(user)}
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={user.status === "ACTIVE" ? "Desactivar" : "Activar"}
                        disabled={user.id === currentUserId}
                        title={user.id === currentUserId ? "No puedes desactivar tu propia cuenta" : undefined}
                        onClick={() =>
                          statusMutation.mutate({ id: user.id, status: user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
                        }
                      >
                        {user.status === "ACTIVE" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        disabled={user.id === currentUserId}
                        title={user.id === currentUserId ? "No puedes eliminar tu propia cuenta" : undefined}
                        onClick={() => {
                          setDeleteTarget(user);
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
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit((values) => saveMutation.mutate(values))} noValidate>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select
                value={watch("roleName")}
                onValueChange={(value) => setValue("roleName", value as UserInput["roleName"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DISPATCHER">Despachador</SelectItem>
                  <SelectItem value="TENANT_ADMIN">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">Nombres</Label>
                <Input id="firstName" {...register("firstName")} />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Apellidos</Label>
                <Input id="lastName" {...register("lastName")} />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefono (opcional)</Label>
                <Input id="phone" {...register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Contrasena inicial</Label>
                <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Comparte esta contrasena con la persona por un canal seguro; puede cambiarla despues desde &quot;¿Olvidaste
              tu contrasena?&quot; en el login.
            </p>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Creando..." : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!statsTarget} onOpenChange={(open) => !open && setStatsTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Estadisticas — {statsTarget?.firstName} {statsTarget?.lastName}
            </DialogTitle>
            <DialogDescription>Viajes, volquetas a cargo y dinero liquidado de este despachador.</DialogDescription>
          </DialogHeader>
          {loadingStats ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : dispatcherStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-secondary/40 p-4">
                  <p className="text-sm text-muted-foreground">Viajes totales</p>
                  <p className="text-2xl font-bold">{dispatcherStats.tripsTotal}</p>
                </div>
                <div className="rounded-md border border-border bg-secondary/40 p-4">
                  <p className="text-sm text-muted-foreground">Viajes completados</p>
                  <p className="text-2xl font-bold">{dispatcherStats.tripsCompleted}</p>
                </div>
                <div className="rounded-md border border-border bg-secondary/40 p-4">
                  <p className="text-sm text-muted-foreground">Volquetas a cargo</p>
                  <p className="text-2xl font-bold">{dispatcherStats.vehiclesCount}</p>
                </div>
                <div className="rounded-md border border-border bg-secondary/40 p-4">
                  <p className="text-sm text-muted-foreground">Dinero pagado</p>
                  <p className="text-2xl font-bold">{money(dispatcherStats.moneyPaid)}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Pendiente por liquidar: <span className="font-medium text-foreground">{money(dispatcherStats.moneyPendingSettlement)}</span>
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/settlements?dispatcherId=${statsTarget?.id}`} onClick={() => setStatsTarget(null)}>
                  Ver liquidaciones de este despachador
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No se pudieron cargar las estadisticas.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
            <DialogDescription>
              Vas a eliminar a{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.firstName} {deleteTarget?.lastName}
              </span>
              . Ya no podra iniciar sesion, pero su historial (viajes creados, tarifas, auditoria) se conserva. Un
              administrador puede consultar esta eliminacion en &quot;Ver eliminados&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="user-delete-reason">Motivo (opcional)</Label>
            <Textarea
              id="user-delete-reason"
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
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletedLogOpen} onOpenChange={setDeletedLogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Usuarios eliminados</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Historial de eliminaciones de usuarios de la empresa. Solo visible para administradores.
            </p>
            {loadingDeleted ? (
              <Skeleton className="h-40 w-full" />
            ) : deletedUsers.length === 0 ? (
              <EmptyState icon={Archive} title="Sin eliminaciones" description="Ningun usuario ha sido eliminado todavia." />
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Eliminado</TableHead>
                      <TableHead>Por</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.firstName} {user.lastName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(user.deletedAt).toLocaleString("es-CO")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.deletedBy ? `${user.deletedBy.firstName} ${user.deletedBy.lastName}` : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.deleteReason ?? "—"}</TableCell>
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
