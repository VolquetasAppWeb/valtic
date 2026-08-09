import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../types/authenticated-user";

// Solo usar en rutas protegidas con TenantScopeGuard, que garantiza tenantId != null.
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
  return request.user.tenantId as string;
});
