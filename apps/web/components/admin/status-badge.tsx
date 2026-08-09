import { Badge } from "@/components/ui/badge";

const VARIANT_BY_STATUS: Record<string, "success" | "warning" | "destructive" | "secondary" | "info"> = {
  ACTIVE: "success",
  INACTIVE: "secondary",
  SUSPENDED: "destructive",
  MAINTENANCE: "warning",
  PLANNED: "info",
  PAUSED: "warning",
  CLOSED: "secondary",
  EXPIRED: "secondary",
  // Trip status
  DRAFT: "secondary",
  ASSIGNED: "info",
  ACCEPTED: "info",
  EN_ROUTE_TO_LOAD: "info",
  LOADING: "warning",
  LOADED: "info",
  EN_ROUTE_TO_UNLOAD: "info",
  UNLOADING: "warning",
  PENDING_VALIDATION: "warning",
  COMPLETED: "success",
  INCLUDED_IN_SETTLEMENT: "success",
  SETTLED: "success",
  UNDER_REVIEW: "warning",
  BLOCKED_BY_INCIDENT: "destructive",
  MANUALLY_CLOSED: "secondary",
  CANCELLED: "destructive",
  REJECTED: "destructive",
  // Settlement status
  APPROVED: "success",
  PAID: "success",
};

const LABEL_BY_STATUS: Record<string, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  SUSPENDED: "Suspendido",
  MAINTENANCE: "Mantenimiento",
  PLANNED: "Planeada",
  PAUSED: "Pausada",
  CLOSED: "Cerrada",
  EXPIRED: "Expirada",
  DRAFT: "Borrador",
  ASSIGNED: "Asignado",
  ACCEPTED: "Aceptado",
  EN_ROUTE_TO_LOAD: "En ruta a cargue",
  LOADING: "Cargando",
  LOADED: "Cargado",
  EN_ROUTE_TO_UNLOAD: "En ruta a descargue",
  UNLOADING: "Descargando",
  PENDING_VALIDATION: "Pendiente validacion",
  COMPLETED: "Completado",
  INCLUDED_IN_SETTLEMENT: "En liquidacion",
  SETTLED: "Liquidado",
  UNDER_REVIEW: "En revision",
  BLOCKED_BY_INCIDENT: "Bloqueado por novedad",
  MANUALLY_CLOSED: "Cierre manual",
  CANCELLED: "Cancelado",
  REJECTED: "Rechazado",
  APPROVED: "Aprobada",
  PAID: "Pagada",
};

export function StatusBadge({ status }: { status: string }): JSX.Element {
  return <Badge variant={VARIANT_BY_STATUS[status] ?? "secondary"}>{LABEL_BY_STATUS[status] ?? status}</Badge>;
}
