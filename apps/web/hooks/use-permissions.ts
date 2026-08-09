import type { PermissionKey } from "@valtic/types";
import { useAuthStore } from "@/stores/auth-store";

// Lectura centralizada de los permisos del usuario administrativo
// autenticado (TENANT_ADMIN/DISPATCHER). No aplica a conductores (usan su
// propio store/layout). El backend sigue siendo la autoridad real — esto
// solo evita mostrar en la UI acciones/paginas que el backend rechazaria.
export function usePermissions() {
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);

  function has(required: PermissionKey | PermissionKey[]): boolean {
    const list = Array.isArray(required) ? required : [required];
    return list.some((key) => permissions.includes(key));
  }

  return { permissions, has };
}
