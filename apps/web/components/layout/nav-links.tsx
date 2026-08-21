"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { usePermissions } from "@/hooks/use-permissions";
import { NAV_ITEMS } from "./nav-items";

// Renderiza la lista de enlaces de navegacion, filtrada por permiso.
// Se usa tanto dentro del sidebar fijo de escritorio (md+) como dentro del
// panel deslizante de movil/tablet, para no duplicar la logica de que ve
// cada rol. `onNavigate` cierra el panel movil al elegir una opcion.
export function NavLinks({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const pathname = usePathname();
  const { has } = usePermissions();
  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || has(item.permission));

  const { data: openIncidents } = useQuery({
    queryKey: ["incidents", "open-count"],
    queryFn: () => apiClient.get<{ count: number }>("/incidents/open-count"),
    refetchInterval: 30_000,
  });

  return (
    <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
      {visibleItems.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        const Icon = item.icon;
        const showAlert = item.href === "/incidents" && (openIncidents?.count ?? 0) > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-[3rem] items-center gap-3 rounded-md px-3 py-2.5 text-base font-semibold transition-colors",
              isActive
                ? "bg-sidebar-accent text-white"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-white",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {showAlert && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-sm font-semibold text-destructive-foreground">
                {openIncidents?.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
