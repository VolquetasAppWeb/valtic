import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { PermissionKey } from "@valtic/types";
import { PERMISSIONS_KEY } from "../../../common/decorators/permissions.decorator";
import type { AuthenticatedUser } from "../../../common/types/authenticated-user";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const user = request.user;

    const hasPermission = requiredPermissions.some((permission) => user.permissions.includes(permission));
    if (!hasPermission) {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: "No tienes permisos suficientes para realizar esta accion.",
        details: { requiredPermissions },
      });
    }

    return true;
  }
}
