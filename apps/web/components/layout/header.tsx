"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient } from "@/lib/api-client";
import { MobileNav } from "./mobile-nav";
import { NotificationsMenu } from "./notifications-menu";
import { ThemeToggle } from "./theme-toggle";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super administrador",
  TENANT_ADMIN: "Administrador",
  DISPATCHER: "Despachador",
  FLEET_OWNER: "Propietario de flota",
};

export function Header(): JSX.Element {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);

  async function handleLogout(): Promise<void> {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Si falla la llamada, igual limpiamos la sesion local.
    }
    clear();
    router.push("/login");
  }

  const initial = user?.firstName?.charAt(0).toUpperCase() ?? "?";

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <MobileNav />
        <div className="hidden sm:block">
          <p className="text-sm text-muted-foreground">Rol</p>
          <p className="text-sm font-medium">
            {user?.roles.map((role) => ROLE_LABEL[role] ?? role).join(", ") || "—"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <ThemeToggle />
        <NotificationsMenu />
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            {initial}
          </div>
          <div className="hidden text-sm sm:block">
            <p className="font-medium leading-none">
              {user ? `${user.firstName} ${user.lastName}` : "Sin sesion"}
            </p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary"
          aria-label="Cerrar sesion"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
