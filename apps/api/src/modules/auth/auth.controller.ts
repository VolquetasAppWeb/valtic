import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CsrfHeaderGuard } from "../../common/guards/csrf-header.guard";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { AppConfig } from "../../config/configuration";
import { AuthService } from "./auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { DriverLoginDto } from "./dto/driver-login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

const REFRESH_COOKIE_NAME = "valtic_refresh";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("admin/login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Inicio de sesion para usuarios administrativos (email + password)" })
  async adminLogin(
    @Body() dto: AdminLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.adminLogin(dto.email, dto.password, this.buildMeta(request, dto.deviceId));
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post("driver/login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Inicio de sesion para conductores (documento/celular + PIN de 6 digitos)" })
  async driverLogin(
    @Body() dto: DriverLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.driverLogin(
      dto.documentOrPhone,
      dto.pin,
      this.buildMeta(request, dto.deviceId),
    );
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, driver: result.driver };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("forgot-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Solicita el envio de un correo para restablecer la contrasena" })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request): Promise<void> {
    await this.authService.forgotPassword(dto.email, this.buildMeta(request));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Restablece la contrasena usando el token enviado por correo" })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request): Promise<void> {
    await this.authService.resetPassword(dto.token, dto.newPassword, this.buildMeta(request));
  }

  @Public()
  @UseGuards(CsrfHeaderGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rota el refresh token (leido de cookie httpOnly) y emite un nuevo access token" })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const rawToken = this.extractRefreshCookie(request);
    if (!rawToken) {
      throw new UnauthorizedException({ code: "AUTH_REFRESH_MISSING", message: "No hay sesion activa." });
    }

    const result = await this.authService.refresh(rawToken, this.buildMeta(request));
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return result.actorKind === "user"
      ? { accessToken: result.accessToken, actorKind: result.actorKind, user: result.user }
      : { accessToken: result.accessToken, actorKind: result.actorKind, driver: result.driver };
  }

  @Public()
  @UseGuards(CsrfHeaderGuard)
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Cierra la sesion actual (revoca el refresh token)" })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const rawToken = this.extractRefreshCookie(request);
    if (rawToken) {
      await this.authService.logout(rawToken, this.buildMeta(request));
    }
    response.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoca todas las sesiones activas del usuario o conductor autenticado" })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user, this.buildMeta(request));
    response.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  private buildMeta(request: Request, deviceId?: string) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      deviceId,
    };
  }

  private extractRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE_NAME];
  }

  private setRefreshCookie(response: Response, token: string, expiresAt: Date): void {
    const isProduction = this.configService.get("nodeEnv", { infer: true }) === "production";
    response.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      // En produccion, web y api viven en dominios distintos (ej. Railway),
      // por lo que la cookie es cross-site: "lax" no viaja en fetch/XHR y
      // rompe el refresh. "none" requiere secure=true, que ya aplica arriba.
      sameSite: isProduction ? "none" : "lax",
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt,
    });
  }
}
