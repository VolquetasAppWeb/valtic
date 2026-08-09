import type { PermissionKey } from "@valtic/types";

export type AuthenticatedActorKind = "user" | "driver";

// Forma comun del payload decodificado del access token (usuarios administrativos y conductores).
export interface AuthenticatedUser {
  sub: string;
  kind: AuthenticatedActorKind;
  tenantId: string | null;
  roles: string[];
  permissions: PermissionKey[];
}
