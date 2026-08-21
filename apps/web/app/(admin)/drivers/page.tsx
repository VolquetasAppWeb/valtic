"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Camera,
  Eye,
  IdCard,
  Image as ImageIcon,
  Info,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  ScanLine,
  Trash2,
  Users,
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
  CedulaExtraction,
  CreatedDriver,
  DeletedDriver,
  Driver,
  DriverDocument,
  DriverLicenseCategoryEntry,
  DriverLicenseExtraction,
  PaginatedResult,
} from "@/lib/api-types";
import { compressImage } from "@/lib/image-compress";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1").replace(/\/api\/v1\/?$/, "");

// Todos los campos leidos de cedula y licencia (menos la tabla de
// categorias, que se muestra aparte porque cada fila trae su propia
// vigencia/servicio) — agrupados igual que en los documentos fisicos.
const DRIVER_CARD_FIELD_GROUPS: Array<{ title: string; fields: Array<{ key: keyof Driver; label: string }> }> = [
  {
    title: "Datos generales del documento",
    fields: [
      { key: "documentType", label: "Tipo de documento" },
      { key: "country", label: "Pais" },
      { key: "documentNumber", label: "NUIP / N° de identificacion" },
    ],
  },
  {
    title: "Informacion personal (cedula)",
    fields: [
      { key: "lastName", label: "Apellidos" },
      { key: "firstName", label: "Nombres" },
      { key: "nationality", label: "Nacionalidad" },
      { key: "height", label: "Estatura" },
      { key: "sex", label: "Sexo" },
      { key: "birthDate", label: "Fecha de nacimiento" },
      { key: "bloodType", label: "Grupo sanguineo (G.S.)" },
      { key: "birthPlace", label: "Lugar de nacimiento" },
      { key: "issuePlace", label: "Fecha y lugar de expedicion" },
      { key: "documentExpirationDate", label: "Fecha de expiracion cedula" },
    ],
  },
  {
    title: "Informacion complementaria (reverso cedula)",
    fields: [
      { key: "supportNumber", label: "N° de soporte/serie" },
      { key: "mrz", label: "Codigo de lectura mecanica (MRZ)" },
    ],
  },
  {
    title: "Licencia de conduccion",
    fields: [
      { key: "licenseNumber", label: "N° de licencia" },
      { key: "licenseIssueDate", label: "Fecha de expedicion" },
      { key: "licenseIssuingAuthority", label: "Organismo de transito" },
      { key: "licenseRestrictions", label: "Restricciones del conductor" },
    ],
  },
];

// Compara nombres/apellidos/documento leidos de la cedula contra los del
// frente de la licencia y avisa si no coinciden (posible documento de otra
// persona) — comparacion laxa (por token, sin tildes) porque el OCR de
// ninguno de los dos lados es perfecto letra por letra.
function normalizeForCompare(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

function checkIdentityMismatch(cedula: CedulaExtraction, license: DriverLicenseExtraction): string | null {
  const issues: string[] = [];

  if (cedula.documentNumber && license.documentNumber && cedula.documentNumber !== license.documentNumber) {
    issues.push("el numero de documento de la cedula no coincide con el de la licencia");
  }

  if (cedula.firstName && cedula.lastName && license.fullName) {
    const fullName = normalizeForCompare(license.fullName);
    const firstToken = normalizeForCompare(cedula.firstName).split(" ")[0];
    const lastToken = normalizeForCompare(cedula.lastName).split(" ")[0];
    if ((firstToken && !fullName.includes(firstToken)) || (lastToken && !fullName.includes(lastToken))) {
      issues.push("el nombre de la cedula no coincide con el de la licencia");
    }
  }

  if (issues.length === 0) return null;
  return `Revisa las fotos: ${issues.join(" y ")}. Puede que sean documentos de personas distintas.`;
}

// El Tipo de Documento colombiano en texto libre que devuelve la IA no
// siempre calza exacto con el enum interno — se normaliza con un fallback
// razonable (CC es, por lejos, el mas comun).
function normalizeDocumentType(raw: string | null): "CC" | "CE" | "PASSPORT" | "NIT" {
  const value = (raw ?? "").toUpperCase();
  if (value.includes("CE")) return "CE";
  if (value.includes("PAS")) return "PASSPORT";
  if (value.includes("NIT")) return "NIT";
  return "CC";
}

// C2/C3 autorizan volquetas de servicio particular Y publico; B2/B3 solo
// particular. Sin ninguna de las 4, el conductor no puede manejar una
// volqueta y no se deja registrar desde este flujo (el resto de categorias
// que tenga ademas no importan para este chequeo).
function volquetaCapability(categories: DriverLicenseCategoryEntry[]): "BOTH" | "PARTICULAR_ONLY" | "NONE" {
  const codes = categories
    .map((c) => c.category ?? "")
    .join(" ")
    .toUpperCase();
  if (/C2|C3/.test(codes)) return "BOTH";
  if (/B2|B3/.test(codes)) return "PARTICULAR_ONLY";
  return "NONE";
}

// La vigencia mas proxima entre todas las categorias — la fecha en la que
// hay que estar pendiente de renovar la licencia.
function earliestExpiration(categories: DriverLicenseCategoryEntry[]): string | null {
  const valid = categories.map((c) => c.expiration).filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (valid.length === 0) return null;
  return [...valid].sort()[0]!;
}

export default function DriversPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canSeeDeletedLog = has([PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL]);

  // --- Registro automatico (solo fotos, sin campos manuales) ---
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [cedulaFrontFile, setCedulaFrontFile] = useState<File | null>(null);
  const [cedulaBackFile, setCedulaBackFile] = useState<File | null>(null);
  const [licenseFrontFile, setLicenseFrontFile] = useState<File | null>(null);
  const [licenseBackFile, setLicenseBackFile] = useState<File | null>(null);
  const [createPhase, setCreatePhase] = useState<"photos" | "error">("photos");
  const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(null);
  const [confirmDriver, setConfirmDriver] = useState<CreatedDriver | null>(null);
  const [confirmWarning, setConfirmWarning] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedLogOpen, setDeletedLogOpen] = useState(false);
  const [viewPinDriver, setViewPinDriver] = useState<Driver | null>(null);
  const [viewedPin, setViewedPin] = useState<string | null>(null);
  const [viewPinError, setViewPinError] = useState<string | null>(null);
  const [infoDriver, setInfoDriver] = useState<Driver | null>(null);

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

  const { data: infoDocuments, isLoading: loadingInfoDocuments } = useQuery({
    queryKey: ["drivers", "documents", infoDriver?.id],
    queryFn: () => apiClient.get<DriverDocument[]>(`/drivers/${infoDriver!.id}/documents`),
    enabled: !!infoDriver,
  });

  function openCreate(): void {
    setCedulaFrontFile(null);
    setCedulaBackFile(null);
    setLicenseFrontFile(null);
    setLicenseBackFile(null);
    setCreatePhase("photos");
    setCreateErrorMessage(null);
    setCreateDialogOpen(true);
  }

  // Lee las 4 fotos (cedula y licencia, frente y reverso), valida que se
  // haya podido identificar al conductor y que su licencia autorice
  // volquetas (B2/B3/C2/C3), crea el conductor con todo lo que la IA leyo,
  // y sube las 4 fotos al historico — todo en un solo intento. Si algo
  // falla queda en el estado "error" con boton para reintentar el mismo
  // proceso con las mismas fotos.
  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!cedulaFrontFile || !cedulaBackFile || !licenseFrontFile || !licenseBackFile) {
        throw new Error("Faltan fotos.");
      }

      const cedulaForm = new FormData();
      cedulaForm.append("front", cedulaFrontFile);
      cedulaForm.append("back", cedulaBackFile);

      const licenseForm = new FormData();
      licenseForm.append("front", licenseFrontFile);
      licenseForm.append("back", licenseBackFile);

      // Son dos llamados a Gemini totalmente independientes (cedula y
      // licencia no dependen entre si) — mandarlos en paralelo en vez de
      // uno tras otro corta a la mitad el tiempo de espera.
      const [cedula, license] = await Promise.all([
        apiClient.post<CedulaExtraction>("/drivers/extract-cedula", cedulaForm),
        apiClient.post<DriverLicenseExtraction>("/drivers/extract-license", licenseForm),
      ]);

      if (!cedula.documentNumber) {
        throw new Error("NO_DOCUMENT_NUMBER");
      }

      if (volquetaCapability(license.categories) === "NONE") {
        throw new Error("NO_VOLQUETA_CATEGORY");
      }

      const warning = checkIdentityMismatch(cedula, license);

      const categoryCodes = license.categories.map((c) => c.category).filter((c): c is string => !!c);

      const driver = await apiClient.post<CreatedDriver>("/drivers", {
        documentType: normalizeDocumentType(cedula.documentType),
        documentNumber: cedula.documentNumber,
        firstName: cedula.firstName || "",
        lastName: cedula.lastName || "",
        licenseNumber: license.licenseNumber || "",
        licenseCategory: categoryCodes.join(", ") || undefined,
        licenseExpiration: earliestExpiration(license.categories) || "",
        licenseCategories: license.categories,
        country: cedula.country || undefined,
        nationality: cedula.nationality || undefined,
        height: cedula.height || undefined,
        sex: cedula.sex || undefined,
        birthDate: cedula.birthDate || license.birthDate || undefined,
        bloodType: cedula.bloodType || license.bloodType || undefined,
        birthPlace: cedula.birthPlace || undefined,
        issuePlace: cedula.issuePlace || undefined,
        documentExpirationDate: cedula.documentExpirationDate || undefined,
        supportNumber: cedula.supportNumber || undefined,
        mrz: cedula.mrz || undefined,
        licenseIssuingAuthority: license.issuingAuthority || undefined,
        licenseRestrictions: license.restrictions || undefined,
        licenseIssueDate: license.issueDate || undefined,
      });

      const uploadPhoto = (file: File, kind: string) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", kind);
        return apiClient.post(`/drivers/${driver.id}/documents`, formData);
      };
      await Promise.all([
        uploadPhoto(cedulaFrontFile, "CEDULA_FRONT"),
        uploadPhoto(cedulaBackFile, "CEDULA_BACK"),
        uploadPhoto(licenseFrontFile, "LICENSE_FRONT"),
        uploadPhoto(licenseBackFile, "LICENSE_BACK"),
      ]);

      return { driver, warning };
    },
    onSuccess: ({ driver, warning }) => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setCreateDialogOpen(false);
      setConfirmDriver(driver);
      setConfirmWarning(warning);
    },
    onError: (error: unknown) => {
      setCreatePhase("error");
      if (error instanceof Error && error.message === "NO_DOCUMENT_NUMBER") {
        setCreateErrorMessage(
          "No se pudo leer el numero de documento en la cedula. Verifica que la foto se vea completa y con buena luz, y vuelve a intentar.",
        );
      } else if (error instanceof Error && error.message === "NO_VOLQUETA_CATEGORY") {
        setCreateErrorMessage(
          "Este conductor no tiene categoria B2, B3, C2 ni C3 en su licencia (ninguna autoriza volquetas), asi que no se puede registrar desde aqui.",
        );
      } else {
        setCreateErrorMessage(error instanceof ApiError ? error.response.message : "No se pudo registrar el conductor.");
      }
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      apiClient.patch<Driver>(`/drivers/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["drivers"] }),
  });

  const viewPinMutation = useMutation({
    mutationFn: (id: string) => apiClient.get<{ pin: string }>(`/drivers/${id}/pin`),
    onSuccess: (data) => {
      setViewedPin(data.pin);
      setViewPinError(null);
    },
    onError: (error: unknown) => {
      setViewPinError(error instanceof ApiError ? error.response.message : "No se pudo consultar el PIN.");
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

  const canSubmitCreate =
    !!cedulaFrontFile && !!cedulaBackFile && !!licenseFrontFile && !!licenseBackFile && !registerMutation.isPending;

  const infoDocs = infoDocuments ?? [];
  const infoCedulaFront = infoDocs.find((doc) => doc.kind === "CEDULA_FRONT");
  const infoCedulaBack = infoDocs.find((doc) => doc.kind === "CEDULA_BACK");
  const infoLicenseFront = infoDocs.find((doc) => doc.kind === "LICENSE_FRONT");
  const infoLicenseBack = infoDocs.find((doc) => doc.kind === "LICENSE_BACK");

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
                <TableHead>Categorias</TableHead>
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
                    <TableCell className="text-muted-foreground">{driver.licenseCategory || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{currentVehicle?.plate ?? "Sin asignar"}</TableCell>
                    <TableCell>
                      <StatusBadge status={driver.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="Ver informacion" onClick={() => setInfoDriver(driver)}>
                          <Info className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Ver PIN"
                          onClick={() => {
                            setViewPinDriver(driver);
                            setViewedPin(null);
                            setViewPinError(null);
                            viewPinMutation.mutate(driver.id);
                          }}
                        >
                          <Eye className="h-4 w-4" />
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

      {/* Registro automatico: solo pide fotos, el resto lo hace la IA. */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!registerMutation.isPending) setCreateDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo conductor</DialogTitle>
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
            <div className="max-h-[70vh] space-y-4 overflow-y-auto">
              <PhotoPicker
                icon={<IdCard className="h-4 w-4" />}
                label="Cedula — frente (obligatoria)"
                file={cedulaFrontFile}
                onChange={setCedulaFrontFile}
                idPrefix="cedula-front"
                disabled={registerMutation.isPending}
              />
              <PhotoPicker
                icon={<IdCard className="h-4 w-4" />}
                label="Cedula — reverso (obligatoria)"
                file={cedulaBackFile}
                onChange={setCedulaBackFile}
                idPrefix="cedula-back"
                disabled={registerMutation.isPending}
              />
              <PhotoPicker
                icon={<ScanLine className="h-4 w-4" />}
                label="Licencia de conduccion — frente (obligatoria)"
                file={licenseFrontFile}
                onChange={setLicenseFrontFile}
                idPrefix="license-front"
                disabled={registerMutation.isPending}
              />
              <PhotoPicker
                icon={<ScanLine className="h-4 w-4" />}
                label="Licencia de conduccion — reverso (obligatoria)"
                file={licenseBackFile}
                onChange={setLicenseBackFile}
                idPrefix="license-back"
                disabled={registerMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                El sistema lee todos los datos de la cedula y la licencia, compara que sean de la misma persona, y
                verifica que la licencia autorice categoria B2, B3, C2 o C3 (volquetas). El PIN de acceso se genera
                solo y se muestra al terminar.
              </p>
              <DialogFooter>
                <Button className="w-full" disabled={!canSubmitCreate} onClick={() => registerMutation.mutate()}>
                  {registerMutation.isPending ? "Leyendo y guardando..." : "Registrar conductor"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmacion: toda la informacion leida + el PIN, de solo lectura. */}
      <Dialog
        open={!!confirmDriver}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDriver(null);
            setConfirmWarning(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Conductor registrado</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              Comparte este PIN con {confirmDriver?.firstName} {confirmDriver?.lastName} para que inicie sesion en la
              app de conductor. Puedes volver a consultarlo con el icono de &quot;Ver PIN&quot; en la lista.
            </p>
            <div className="rounded-md border border-border bg-secondary/40 p-4 text-center">
              <p className="text-xs text-muted-foreground">PIN de acceso</p>
              <p className="font-mono text-3xl font-semibold tracking-widest">{confirmDriver?.pin}</p>
            </div>
            {confirmWarning && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {confirmWarning}
              </p>
            )}
            <p className="text-sm text-muted-foreground">Confirma que los datos leidos sean correctos.</p>
            {confirmDriver && (
              <>
                <DriverLicenseCategoriesTable categories={confirmDriver.licenseCategories} />
                <DriverCardDetails driver={confirmDriver} />
              </>
            )}
            <DialogFooter>
              <Button onClick={() => setConfirmDriver(null)}>Listo</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ver informacion: datos completos + las fotos de cedula y licencia. */}
      <Dialog open={!!infoDriver} onOpenChange={(open) => !open && setInfoDriver(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {infoDriver?.firstName} {infoDriver?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto">
            <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-secondary/40 p-4 text-sm sm:grid-cols-2">
              <InfoField label="Estado" value={infoDriver?.status} />
              <InfoField label="Vencimiento licencia" value={infoDriver?.licenseExpiration?.slice(0, 10)} />
            </div>

            {infoDriver && (
              <>
                <DriverLicenseCategoriesTable categories={infoDriver.licenseCategories} />
                <DriverCardDetails driver={infoDriver} />
              </>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Fotos</p>
              {loadingInfoDocuments ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <PhotoThumb label="Cedula frente" doc={infoCedulaFront} />
                  <PhotoThumb label="Cedula reverso" doc={infoCedulaBack} />
                  <PhotoThumb label="Licencia frente" doc={infoLicenseFront} />
                  <PhotoThumb label="Licencia reverso" doc={infoLicenseBack} />
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewPinDriver}
        onOpenChange={(open) => {
          if (!open) {
            setViewPinDriver(null);
            setViewedPin(null);
            setViewPinError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PIN de acceso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              PIN actual de {viewPinDriver?.firstName} {viewPinDriver?.lastName}.
            </p>
            {viewPinError ? (
              <p className="text-sm text-destructive">{viewPinError}</p>
            ) : (
              <div className="rounded-md border border-border bg-secondary/40 p-4 text-center">
                {viewPinMutation.isPending ? (
                  <p className="text-sm text-muted-foreground">Consultando...</p>
                ) : (
                  <p className="font-mono text-3xl font-semibold tracking-widest">{viewedPin ?? "——————"}</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setViewPinDriver(null)}>Listo</Button>
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

function InfoField({ label, value }: { label: string; value: string | null | undefined }): JSX.Element {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

// Tabla de categorias autorizadas — cada fila con su propia clase de
// vehiculo, vigencia y servicio, tal cual viene impreso en la licencia.
function DriverLicenseCategoriesTable({ categories }: { categories: DriverLicenseCategoryEntry[] | null }): JSX.Element {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Categorias autorizadas</p>
      {!categories || categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin categorias registradas.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Categoria</th>
                <th className="px-3 py-2 text-left font-medium">Clase de vehiculo</th>
                <th className="px-3 py-2 text-left font-medium">Vigencia</th>
                <th className="px-3 py-2 text-left font-medium">Servicio</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((row, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{row.category || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.vehicleClass || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.expiration || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.serviceType || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Todos los campos de cedula y licencia, agrupados igual que en los
// documentos fisicos.
function DriverCardDetails({ driver }: { driver: Driver }): JSX.Element {
  return (
    <div className="space-y-4">
      {DRIVER_CARD_FIELD_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{group.title}</p>
          <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-secondary/40 p-3 text-sm sm:grid-cols-2">
            {group.fields.map((field) => {
              const raw = driver[field.key];
              return <InfoField key={field.key} label={field.label} value={raw != null ? String(raw) : null} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PhotoThumb({ label, doc }: { label: string; doc: DriverDocument | undefined }): JSX.Element {
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
          "capture" el sistema ofrece la galeria/archivos. Se comprime antes
          de pasarla al padre: reduce el tiempo de subida y de lectura por
          IA sin perder legibilidad (ver lib/image-compress.ts). */}
      <input
        id={`${idPrefix}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={async (e) => {
          const picked = e.target.files?.[0] ?? null;
          onChange(picked ? await compressImage(picked) : null);
        }}
        className="hidden"
      />
      <input
        id={`${idPrefix}-gallery`}
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const picked = e.target.files?.[0] ?? null;
          onChange(picked ? await compressImage(picked) : null);
        }}
        className="hidden"
      />
      {file && <p className="text-xs text-muted-foreground">Foto seleccionada: {file.name}</p>}
    </div>
  );
}
