import { useAuthStore } from "@/stores/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

// Intenta restaurar la sesion al cargar la app leyendo la cookie httpOnly de
// refresh token. No hay token de acceso persistido en el cliente por diseno
// (mitiga XSS), asi que cada carga de pagina depende de este bootstrap.
export async function bootstrapSession(): Promise<void> {
  const store = useAuthStore.getState();
  store.setStatus("loading");

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });

    if (!response.ok) {
      store.clear();
      return;
    }

    const data = (await response.json()) as {
      accessToken: string;
      actorKind: "user" | "driver";
      user?: Parameters<typeof store.setUserSession>[1];
      driver?: Parameters<typeof store.setDriverSession>[1];
    };

    if (data.actorKind === "user" && data.user) {
      store.setUserSession(data.accessToken, data.user);
    } else if (data.actorKind === "driver" && data.driver) {
      store.setDriverSession(data.accessToken, data.driver);
    } else {
      store.clear();
    }
  } catch {
    store.clear();
  }
}
