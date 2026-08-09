import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

// Mitigacion CSRF ligera para los endpoints publicos que dependen unicamente
// de la cookie httpOnly de refresh (no llevan Authorization: Bearer). Un
// formulario cross-site no puede fijar headers personalizados sin disparar
// un preflight CORS, que el origen configurado en CORS_ORIGIN bloqueara.
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers["x-requested-with"] !== "XMLHttpRequest") {
      throw new ForbiddenException({
        code: "CSRF_HEADER_MISSING",
        message: "Solicitud rechazada por falta de encabezado de proteccion CSRF.",
      });
    }
    return true;
  }
}
