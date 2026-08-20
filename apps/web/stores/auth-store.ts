import { create } from "zustand";

export interface AdminSessionUser {
  id: string;
  tenantId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface DriverSessionActor {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  documentNumber: string;
  permissions: string[];
  // Despachador dueno de este registro (null si lo creo un TENANT_ADMIN) —
  // el mismo documento puede estar registrado en varias cuentas de
  // despachador a la vez, cada una con su propio PIN, asi que se muestra
  // para dejar claro a que cuenta pertenece la sesion actual.
  dispatcherName: string | null;
}

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  accessToken: string | null;
  kind: "user" | "driver" | null;
  user: AdminSessionUser | null;
  driver: DriverSessionActor | null;
  status: AuthStatus;
  setStatus: (status: AuthStatus) => void;
  setUserSession: (accessToken: string, user: AdminSessionUser) => void;
  setDriverSession: (accessToken: string, driver: DriverSessionActor) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  kind: null,
  user: null,
  driver: null,
  status: "idle",
  setStatus: (status) => set({ status }),
  setUserSession: (accessToken, user) =>
    set({ accessToken, user, driver: null, kind: "user", status: "authenticated" }),
  setDriverSession: (accessToken, driver) =>
    set({ accessToken, driver, user: null, kind: "driver", status: "authenticated" }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clear: () => set({ accessToken: null, user: null, driver: null, kind: null, status: "unauthenticated" }),
}));
