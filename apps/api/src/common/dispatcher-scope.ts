import type { AuthenticatedUser } from "./types/authenticated-user";

// Un DISPATCHER ve y gestiona unicamente sus propios conductores, vehiculos
// y obras (Driver/Vehicle/Project.dispatcherId). TENANT_ADMIN ve todo el
// tenant sin restriccion; un actor con ambos roles se trata como admin
// (acceso total). Los actores kind === "driver" nunca llegan a estos
// endpoints (bloqueados por el guard de permisos correspondiente).
export function isDispatcherScoped(actor: AuthenticatedUser): boolean {
  return actor.kind === "user" && actor.roles.includes("DISPATCHER") && !actor.roles.includes("TENANT_ADMIN");
}
