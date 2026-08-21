"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Camera,
  Image as ImageIcon,
  Info,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  ScanLine,
  Trash2,
  Truck,
  UserCog,
  UserX,
} from "lucide-react";
import { PERMISSIONS } from "@valtic/types";
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
import type {
  DeletedVehicle,
  Driver,
  PaginatedResult,
  Vehicle,
  VehicleDocument,
  VehicleRegistrationExtraction,
} from "@/lib/api-types";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1").replace(/\/api\/v1\/?$/, "");

const VEHICLE_TYPE_LABEL: Record<string, string> = {
  DUMP_TRUCK: "Volqueta",
  DOUBLE_TRAILER: "Doble troque",
  MINI_DUMP_TRUCK: "Mini volqueta",
  TRACTOR_TRAILER: "Tractomula",
  OTHER: "Otro",
};

// Todos los campos que trae la tarjeta de propiedad, agrupados como en el
// documento fisico (datos generales / cara frontal / cara posterior) — se
// usa tanto en la confirmacion post-registro como en "Ver informacion".
const CARD_FIELD_GROUPS: Array<{ title: string; fields: Array<{ key: keyof Vehicle; label: string }> }> = [
  {
    title: "Datos generales del documento",
    fields: [
      { key: "country", label: "Pais" },
      { key: "licenseNumber", label: "N° licencia de transito" },
      { key: "licenseBarcode", label: "Codigo de barras (LIC)" },
    ],
  },
  {
    title: "Informacion del vehiculo (cara frontal)",
    fields: [
      { key: "plate", label: "Placa" },
      { key: "brand", label: "Marca" },
      { key: "model", label: "Linea" },
      { key: "year", label: "Modelo (año)" },
      { key: "cc", label: "Cilindrada (CC)" },
      { key: "color", label: "Color" },
      { key: "serviceType", label: "Servicio" },
      { key: "vehicleClass", label: "Clase de vehiculo" },
      { key: "bodyType", label: "Tipo carroceria" },
      { key: "fuelType", label: "Combustible" },
      { key: "loadCapacity", label: "Capacidad (Kg/PSJ)" },
      { key: "engineNumber", label: "N° motor" },
      { key: "serialNumber", label: "N° serie" },
      { key: "vin", label: "VIN" },
      { key: "chassisNumber", label: "N° chasis" },
      { key: "ownerName", label: "Propietario (nombre/razon social)" },
      { key: "ownerDocumentNumber", label: "Identificacion propietario" },
    ],
  },
  {
    title: "Informacion complementaria y tramites (cara posterior)",
    fields: [
      { key: "mobilityRestriction", label: "Restriccion movilidad" },
      { key: "armor", label: "Blindaje" },
      { key: "horsepower", label: "Potencia (HP)" },
      { key: "importDeclaration", label: "Declaracion de importacion" },
      { key: "importDate", label: "Fecha de importacion" },
      { key: "doors", label: "Puertas" },
      { key: "propertyLimitation", label: "Limitacion a la propiedad" },
      { key: "registrationDate", label: "Fecha de matricula" },
      { key: "licenseIssueDate", label: "Fecha de expedicion Lic. Tto." },
      { key: "licenseExpirationDate", label: "Fecha de vencimiento" },
      { key: "transitAuthority", label: "Organismo de transito" },
    ],
  },
];

// Los campos de la tarjeta que se autocompletan solos con el registro
// automatico (todo menos plate/vehicleType/brand/model/year/licenseNumber,
// que ya tenian su propio manejo antes de agregar el resto de la tarjeta).
const EXTRA_CARD_FIELD_KEYS = CARD_FIELD_GROUPS.flatMap((group) => group.fields.map((f) => f.key)).filter(
  (key) => !["plate", "brand", "model", "year", "licenseNumber"].includes(key),
) as Array<keyof VehicleRegistrationExtraction>;

// Si el OCR leyo "ABC123" (sin guion) se lo agrega para que calce con el
// formato exigido por el backend (XXX-111); si no calza con ese patron se
// deja tal cual (el registro automatico fallara y se le pedira reintentar).
function formatPlateGuess(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = /^([A-Z]{3})(\d{3})$/.exec(compact);
  return match ? `${match[1]}-${match[2]}` : raw;
}

export default function VehiclesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canSeeDeletedLog = has([PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL]);

  // --- Registro automatico (solo fotos, sin campos manuales) ---
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createFrontFile, setCreateFrontFile] = useState<File | null>(null);
  const [createBackFile, setCreateBackFile] = useState<File | null>(null);
  const [createTruckFile, setCreateTruckFile] = useState<File | null>(null);
  const [createPhase, setCreatePhase] = useState<"photos" | "error">("photos");
  const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(null);
  const [confirmVehicle, setConfirmVehicle] = useState<Vehicle | null>(null);

  const [assignDialogVehicle, setAssignDialogVehicle] = useState<Vehicle | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedLogOpen, setDeletedLogOpen] = useState(false);
  const [infoVehicle, setInfoVehicle] = useState<Vehicle | null>(null);

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

  const { data: infoDocuments, isLoading: loadingInfoDocuments } = useQuery({
    queryKey: ["vehicles", "documents", infoVehicle?.id],
    queryFn: () => apiClient.get<VehicleDocument[]>(`/vehicles/${infoVehicle!.id}/documents`),
    enabled: !!infoVehicle,
  });

  function openCreate(): void {
    setCreateFrontFile(null);
    setCreateBackFile(null);
    setCreateTruckFile(null);
    setCreatePhase("photos");
    setCreateErrorMessage(null);
    setCreateDialogOpen(true);
  }

  // Lee ambas fotos de la tarjeta de propiedad con OCR, crea el vehiculo con
  // lo que se pudo leer, y sube las 3 fotos (frente/reverso obligatorias,
  // volqueta opcional) al historico — todo en un solo intento sin pedirle
  // nada mas al usuario. Si algo falla (no se pudo leer la placa, la placa
  // ya existe, error de red, etc.) queda en el estado "error" con boton para
  // reintentar el mismo proceso con las mismas fotos.
  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!createFrontFile || !createBackFile) {
        throw new Error("Faltan fotos de la tarjeta de propiedad.");
      }

      const extractForm = new FormData();
      extractForm.append("front", createFrontFile);
      extractForm.append("back", createBackFile);
      const extracted = await apiClient.post<VehicleRegistrationExtraction>("/vehicles/extract-registration", extractForm);

      const plate = extracted.plate ? formatPlateGuess(extracted.plate) : null;
      if (!plate) {
        throw new Error("NO_PLATE");
      }

      // Resto de campos de la tarjeta (color, VIN, propietario impreso, fechas,
      // etc) — se mandan todos los que la IA haya podido leer, sin pedirselos
      // al usuario.
      const extraCardFields = Object.fromEntries(
        EXTRA_CARD_FIELD_KEYS.map((key) => [key, extracted[key] || undefined]),
      );

      const vehicle = await apiClient.post<Vehicle>("/vehicles", {
        plate,
        vehicleType: "DUMP_TRUCK",
        brand: extracted.brand || undefined,
        model: extracted.line || undefined,
        year: extracted.modelYear ? Number(extracted.modelYear) : new Date().getFullYear(),
        licenseNumber: extracted.licenseNumber || undefined,
        ...extraCardFields,
      });

      const uploadPhoto = (file: File, kind: string) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", kind);
        return apiClient.post(`/vehicles/${vehicle.id}/documents`, formData);
      };
      await Promise.all([
        uploadPhoto(createFrontFile, "REGISTRATION_FRONT"),
        uploadPhoto(createBackFile, "REGISTRATION_BACK"),
        ...(createTruckFile ? [uploadPhoto(createTruckFile, "VEHICLE_PHOTO")] : []),
      ]);

      return vehicle;
    },
    onSuccess: (vehicle) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setCreateDialogOpen(false);
      setConfirmVehicle(vehicle);
    },
    onError: (error: unknown) => {
      setCreatePhase("error");
      if (error instanceof Error && error.message === "NO_PLATE") {
        setCreateErrorMessage(
          "No se pudo leer la placa en las fotos. Verifica que la tarjeta se vea completa y con buena luz, y vuelve a intentar.",
        );
      } else {
        setCreateErrorMessage(error instanceof ApiError ? error.response.message : "No se pudo registrar el vehiculo.");
      }
    },
  });

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

  const unassignMutation = useMutation({
    mutationFn: (assignmentId: string) => apiClient.patch(`/driver-vehicle-assignments/${assignmentId}/end`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
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
  const drivers = driversData?.data ?? [];

  const canSubmitCreate = !!createFrontFile && !!createBackFile && !registerMutation.isPending;

  const infoDocs = infoDocuments ?? [];
  const infoFrontDoc = infoDocs.find((doc) => doc.kind === "REGISTRATION_FRONT");
  const infoBackDoc = infoDocs.find((doc) => doc.kind === "REGISTRATION_BACK");
  const infoTruckDoc = infoDocs.find((doc) => doc.kind === "VEHICLE_PHOTO");
  const infoOtherDocs = infoDocs.filter((doc) => !["REGISTRATION_FRONT", "REGISTRATION_BACK", "VEHICLE_PHOTO"].includes(doc.kind));
  const infoDriver = infoVehicle?.assignments?.find((a) => a.active)?.driver;

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
                const currentAssignment = vehicle.assignments?.find((a) => a.active);
                const currentDriver = currentAssignment?.driver;
                return (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">{vehicle.plate}</TableCell>
                    <TableCell className="text-muted-foreground">{VEHICLE_TYPE_LABEL[vehicle.vehicleType]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "—"} ({vehicle.year})
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {vehicle.capacity
                        ? `${vehicle.capacity} ${vehicle.capacityUnit === "TON" ? "ton" : "m3"}`
                        : vehicle.loadCapacity || "—"}
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
                          aria-label="Ver informacion"
                          onClick={() => setInfoVehicle(vehicle)}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Asignar conductor"
                          onClick={() => setAssignDialogVehicle(vehicle)}
                        >
                          <UserCog className="h-4 w-4" />
                        </Button>
                        {currentAssignment && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Desasignar conductor"
                            disabled={unassignMutation.isPending}
                            onClick={() => unassignMutation.mutate(currentAssignment.id)}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        )}
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

      {/* Registro automatico: solo pide fotos, el resto lo hace la IA. */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!registerMutation.isPending) setCreateDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo vehiculo</DialogTitle>
          </DialogHeader>

          {createPhase === "error" ? (
            <div className="space-y-4">
              <p className="text-sm text-destructive">{createErrorMessage}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCreatePhase("photos");
                    setCreateErrorMessage(null);
                  }}
                >
                  Cambiar fotos
                </Button>
                <Button className="flex-1" onClick={() => registerMutation.mutate()} disabled={registerMutation.isPending}>
                  <RefreshCw className="h-4 w-4" />
                  Intentalo de nuevo
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <PhotoPicker
                icon={<ScanLine className="h-4 w-4" />}
                label="Tarjeta de propiedad — frente (obligatoria)"
                file={createFrontFile}
                onChange={setCreateFrontFile}
                idPrefix="registration-front"
                disabled={registerMutation.isPending}
              />
              <PhotoPicker
                icon={<ScanLine className="h-4 w-4" />}
                label="Tarjeta de propiedad — reverso (obligatoria)"
                file={createBackFile}
                onChange={setCreateBackFile}
                idPrefix="registration-back"
                disabled={registerMutation.isPending}
              />
              <PhotoPicker
                icon={<Truck className="h-4 w-4" />}
                label="Foto de la volqueta (opcional)"
                file={createTruckFile}
                onChange={setCreateTruckFile}
                idPrefix="truck-photo"
                disabled={registerMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                El sistema lee la placa, marca, linea, modelo y numero de licencia de transito directamente de las
                fotos y registra el vehiculo automaticamente.
              </p>
              <DialogFooter>
                <Button className="w-full" disabled={!canSubmitCreate} onClick={() => registerMutation.mutate()}>
                  {registerMutation.isPending ? "Leyendo y guardando..." : "Registrar vehiculo"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmacion: se muestra sola, de solo lectura, apenas se guarda. */}
      <Dialog open={!!confirmVehicle} onOpenChange={(open) => !open && setConfirmVehicle(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vehiculo registrado</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto">
            <p className="text-sm text-muted-foreground">Confirma que los datos leidos de la tarjeta de propiedad sean correctos.</p>
            <InfoField label="Tipo" value={confirmVehicle ? VEHICLE_TYPE_LABEL[confirmVehicle.vehicleType] : undefined} />
            {confirmVehicle && <VehicleCardDetails vehicle={confirmVehicle} />}
            <DialogFooter>
              <Button onClick={() => setConfirmVehicle(null)}>Listo</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ver informacion: datos completos + las fotos de la tarjeta y de la volqueta. */}
      <Dialog open={!!infoVehicle} onOpenChange={(open) => !open && setInfoVehicle(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{infoVehicle?.plate}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto">
            <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-secondary/40 p-4 text-sm sm:grid-cols-2">
              <InfoField label="Tipo" value={infoVehicle ? VEHICLE_TYPE_LABEL[infoVehicle.vehicleType] : undefined} />
              <InfoField label="Estado" value={infoVehicle?.status} />
              <InfoField
                label="Capacidad"
                value={
                  infoVehicle?.capacity
                    ? `${infoVehicle.capacity} ${infoVehicle.capacityUnit === "TON" ? "ton" : "m3"}`
                    : infoVehicle?.loadCapacity
                }
              />
              <InfoField label="Propietario" value={infoVehicle?.fleetOwner?.name} />
              <InfoField label="Conductor" value={infoDriver ? `${infoDriver.firstName} ${infoDriver.lastName}` : "Sin asignar"} />
            </div>

            {infoVehicle && <VehicleCardDetails vehicle={infoVehicle} />}

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Fotos</p>
              {loadingInfoDocuments ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <PhotoThumb label="Frente" doc={infoFrontDoc} />
                  <PhotoThumb label="Reverso" doc={infoBackDoc} />
                  <PhotoThumb label="Volqueta" doc={infoTruckDoc} />
                </div>
              )}
              {infoOtherDocs.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <p className="text-xs text-muted-foreground">Otras fotos subidas</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {infoOtherDocs.map((doc) => (
                      <PhotoThumb key={doc.id} label={new Date(doc.createdAt).toLocaleDateString("es-CO")} doc={doc} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
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

function InfoField({ label, value }: { label: string; value: string | null | undefined }): JSX.Element {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

// Todos los campos de la tarjeta de propiedad, agrupados igual que en el
// documento fisico (datos generales / cara frontal / cara posterior).
function VehicleCardDetails({ vehicle }: { vehicle: Vehicle }): JSX.Element {
  return (
    <div className="space-y-4">
      {CARD_FIELD_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{group.title}</p>
          <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-secondary/40 p-3 text-sm sm:grid-cols-2">
            {group.fields.map((field) => {
              const value = vehicle[field.key];
              return <InfoField key={field.key} label={field.label} value={value != null ? String(value) : null} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PhotoThumb({ label, doc }: { label: string; doc: VehicleDocument | undefined }): JSX.Element {
  if (!doc) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-center">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">Sin foto</p>
      </div>
    );
  }
  return (
    <a href={`${API_ORIGIN}${doc.fileUrl}`} target="_blank" rel="noreferrer" className="space-y-1">
      <img src={`${API_ORIGIN}${doc.fileUrl}`} alt={label} className="aspect-square w-full rounded-md border border-border object-cover" />
      <p className="truncate text-center text-[10px] text-muted-foreground">{label}</p>
    </a>
  );
}

function PhotoPicker({
  icon,
  label,
  file,
  onChange,
  idPrefix,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  idPrefix: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-secondary/40 p-3">
      <Label className="flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={disabled}
          onClick={() => document.getElementById(`${idPrefix}-camera`)?.click()}
        >
          <Camera className="h-4 w-4" />
          Tomar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={disabled}
          onClick={() => document.getElementById(`${idPrefix}-gallery`)?.click()}
        >
          <ImageIcon className="h-4 w-4" />
          Elegir de galeria
        </Button>
      </div>
      {/* Dos inputs separados: "capture" fuerza la camara en movil, sin
          "capture" el sistema ofrece la galeria/archivos. */}
      <input
        id={`${idPrefix}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      <input
        id={`${idPrefix}-gallery`}
        type="file"
        accept="image/*"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      {file && <p className="text-xs text-muted-foreground">Foto seleccionada: {file.name}</p>}
    </div>
  );
}
