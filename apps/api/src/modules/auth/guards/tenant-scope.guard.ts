import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../../../common/types/authenticated-user";

// Bloquea el acceso a recursos de un tenant a cualquier actor sin tenantId
// (SUPER_ADMIN). Se aplica en todos los controladores de datos operativos.
@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    if (!request.user.tenantId) {
      throw new ForbiddenException({
        code: "TENANT_SCOPE_REQUIRED",
        message: "Esta accion requiere un usuario asociado a una empresa (tenant).",
      });
    }
    return true;
  }
}
