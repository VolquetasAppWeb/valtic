"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiClient } from "@/lib/api-client";
import { usePermissions } from "@/hooks/use-permissions";
import { PERMISSIONS } from "@valtic/types";
import type { Incident, PaginatedResult } from "@/lib/api-types";

const TYPE_LABEL: Record<string, string> = {
  MECHANICAL_FAILURE: "Falla mecanica",
  TRAFFIC_ACCIDENT: "Accidente de transito",
  DELAY: "Demora",
  WEATHER: "Clima",
  SECURITY: "Seguridad",
  CARGO_ISSUE: "Problema de carga",
  ROAD_CLOSURE: "Via cerrada",
  OTHER: "Otro",
};

const SEVERITY_LABEL: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Critica" };

export function NotificationsMenu(): JSX.Element | null {
  const router = useRouter();
  const { has } = usePermissions();
  const canReadIncidents = has(PERMISSIONS.INCIDENTS_READ);

  const { data } = useQuery({
    queryKey: ["incidents", "notifications"],
    queryFn: () => apiClient.get<PaginatedResult<Incident>>("/incidents?status=OPEN&pageSize=10"),
    enabled: canReadIncidents,
    refetchInterval: 30_000,
  });

  if (!canReadIncidents) {
    return null;
  }

  const openIncidents = data?.data ?? [];
  const count = data?.meta.totalItems ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative hidden h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary sm:flex"
          aria-label={count > 0 ? `Notificaciones (${count} novedades abiertas)` : "Notificaciones"}
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Novedades abiertas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {openIncidents.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">No hay novedades abiertas.</p>
        ) : (
          openIncidents.map((incident) => (
            <DropdownMenuItem
              key={incident.id}
              className="flex-col items-start gap-0.5"
              onSelect={() => router.push("/incidents")}
            >
              <div className="flex w-full items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                <span className="flex-1 truncate font-medium">{TYPE_LABEL[incident.type] ?? incident.type}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{SEVERITY_LABEL[incident.severity]}</span>
              </div>
              <span className="pl-[22px] text-xs text-muted-foreground">
                {incident.driver.firstName} {incident.driver.lastName} ·{" "}
                {new Date(incident.reportedAt).toLocaleString("es-CO")}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="justify-center text-sm font-medium" onSelect={() => router.push("/incidents")}>
          Ver todas las novedades
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
