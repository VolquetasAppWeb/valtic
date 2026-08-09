import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../../../common/decorators/public.decorator";
import type { AuthenticatedUser } from "../../../common/types/authenticated-user";
import { TokenService } from "../token.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({ code: "AUTH_TOKEN_MISSING", message: "Token de acceso requerido." });
    }

    try {
      request.user = await this.tokenService.verifyAccessToken(token);
      return true;
    } catch {
      throw new UnauthorizedException({ code: "AUTH_TOKEN_INVALID", message: "Token de acceso invalido o expirado." });
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return undefined;
    }
    return header.slice("Bearer ".length);
  }
}
