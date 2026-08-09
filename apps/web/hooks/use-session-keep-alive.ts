import { useEffect } from "react";
import { refreshAccessToken } from "@/lib/api-client";
import type { AuthStatus } from "@/stores/auth-store";

// Antes de este hook, el access token (15 min) solo se renovaba de forma
// reactiva: si el usuario quedaba varios minutos sin disparar ninguna
// peticion (leyendo una pantalla, por ejemplo), el token expiraba en
// silencio y el siguiente clic podia fallar. Este hook lo renueva de forma
// proactiva mientras la sesion siga activa, y ademas al recuperar el foco
// de la pestana (el caso mas comun de "se cerro la sesion" percibido por
// el usuario: volver a la pestana despues de un rato).
const REFRESH_INTERVAL_MS = 8 * 60_000;

export function useSessionKeepAlive(status: AuthStatus): void {
  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshAccessToken();
    }, REFRESH_INTERVAL_MS);

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void refreshAccessToken();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [status]);
}
