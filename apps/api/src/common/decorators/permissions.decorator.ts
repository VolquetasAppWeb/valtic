import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@valtic/types";

export const PERMISSIONS_KEY = "permissions";

// Exige que el usuario autenticado tenga al menos uno de estos permisos.
export const Permissions = (...permissions: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, permissions);
