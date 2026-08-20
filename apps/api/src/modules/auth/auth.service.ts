import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { TENANT_ROLE_DEFAULT_PERMISSIONS, type PermissionKey } from "@valtic/types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MailService } from "../mail/mail.service";
import { TokenService } from "./token.service";
import type { AppConfig } from "../../config/configuration";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AdminLoginResult extends LoginResult {
  user: {
    id: string;
    tenantId: string | null;
    firstName: string;
    lastName: string;
    email: string;
    roles: string[];
    permissions: PermissionKey[];
  };
}

export interface DriverLoginResult extends LoginResult {
  driver: {
    id: string;
    tenantId: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    permissions: PermissionKey[];
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async adminLogin(email: string, password: string, meta: RequestMeta): Promise<AdminLoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email, status: "ACTIVE" },
      include: {
        userRoles: {
          include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
        },
      },
    });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await this.auditService.record({
        tenantId: user.tenantId,
        action: "AUTH_ACCOUNT_LOCKED",
        entityType: "User",
        entityId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException({
        code: "AUTH_ACCOUNT_LOCKED",
        message: `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo despues de ${user.lockedUntil.toISOString()}.`,
      });
    }

    const passwordValid = user ? await argon2.verify(user.passwordHash, password).catch(() => false) : false;

    if (!user || !passwordValid) {
      if (user) {
        const lockConfig = this.configService.get("adminLogin", { infer: true });
        const failedAttempts = user.failedLoginAttempts + 1;
        const shouldLock = failedAttempts >= lockConfig.maxAttempts;

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: shouldLock ? 0 : failedAttempts,
            lockedUntil: shouldLock ? new Date(Date.now() + lockConfig.lockMinutes * 60_000) : null,
          },
        });

        await this.auditService.record({
          tenantId: user.tenantId,
          action: shouldLock ? "AUTH_ACCOUNT_LOCKED" : "AUTH_LOGIN_FAILED",
          entityType: "User",
          entityId: user.id,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      } else {
        await this.auditService.record({
          action: "AUTH_LOGIN_FAILED",
          entityType: "User",
          entityId: email,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      }
      throw new UnauthorizedException({ code: "AUTH_INVALID_CREDENTIALS", message: "Credenciales invalidas." });
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const roles = user.userRoles.map((userRole) => userRole.role.name);
    const permissions = this.uniquePermissions(
      user.userRoles.flatMap((userRole) => userRole.role.rolePermissions.map((rp) => rp.permission.key as PermissionKey)),
    );

    const authenticatedUser: AuthenticatedUser = {
      sub: user.id,
      kind: "user",
      tenantId: user.tenantId,
      roles,
      permissions,
    };

    const { accessToken, refreshToken, refreshTokenExpiresAt } = await this.issueSession(authenticatedUser, meta, {
      userId: user.id,
    });

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await this.auditService.record({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "AUTH_LOGIN_SUCCESS",
      entityType: "User",
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        roles,
        permissions,
      },
    };
  }

  async driverLogin(documentOrPhone: string, pin: string, meta: RequestMeta): Promise<DriverLoginResult> {
    // El telefono ya no es un campo del conductor (se elimino: no aparece
    // en cedula ni licencia) — el login queda solo por numero de documento.
    const driver = await this.prisma.driver.findFirst({
      where: { documentNumber: documentOrPhone, status: "ACTIVE" },
    });

    if (!driver) {
      throw new UnauthorizedException({ code: "AUTH_INVALID_CREDENTIALS", message: "Credenciales invalidas." });
    }

    const lockConfig = this.configService.get("driverPin", { infer: true });

    if (driver.pinLockedUntil && driver.pinLockedUntil > new Date()) {
      await this.auditService.record({
        tenantId: driver.tenantId,
        action: "AUTH_DRIVER_PIN_LOCKED",
        entityType: "Driver",
        entityId: driver.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException({
        code: "AUTH_PIN_LOCKED",
        message: `PIN bloqueado temporalmente. Intenta de nuevo despues de ${driver.pinLockedUntil.toISOString()}.`,
      });
    }

    const pinValid = await argon2.verify(driver.pinHash, pin).catch(() => false);

    if (!pinValid) {
      const failedAttempts = driver.pinFailedAttempts + 1;
      const shouldLock = failedAttempts >= lockConfig.maxAttempts;

      await this.prisma.driver.update({
        where: { id: driver.id },
        data: {
          pinFailedAttempts: shouldLock ? 0 : failedAttempts,
          pinLockedUntil: shouldLock ? new Date(Date.now() + lockConfig.lockMinutes * 60_000) : null,
        },
      });

      await this.auditService.record({
        tenantId: driver.tenantId,
        action: shouldLock ? "AUTH_DRIVER_PIN_LOCKED" : "AUTH_LOGIN_FAILED",
        entityType: "Driver",
        entityId: driver.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      throw new UnauthorizedException({ code: "AUTH_INVALID_CREDENTIALS", message: "Credenciales invalidas." });
    }

    if (driver.pinFailedAttempts > 0 || driver.pinLockedUntil) {
      await this.prisma.driver.update({
        where: { id: driver.id },
        data: { pinFailedAttempts: 0, pinLockedUntil: null },
      });
    }

    const permissions = TENANT_ROLE_DEFAULT_PERMISSIONS.DRIVER;

    const authenticatedUser: AuthenticatedUser = {
      sub: driver.id,
      kind: "driver",
      tenantId: driver.tenantId,
      roles: ["DRIVER"],
      permissions,
    };

    const { accessToken, refreshToken, refreshTokenExpiresAt } = await this.issueSession(authenticatedUser, meta, {
      driverId: driver.id,
    });

    await this.prisma.driver.update({ where: { id: driver.id }, data: { lastLoginAt: new Date() } });

    await this.auditService.record({
      tenantId: driver.tenantId,
      action: "AUTH_LOGIN_SUCCESS",
      entityType: "Driver",
      entityId: driver.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      driver: {
        id: driver.id,
        tenantId: driver.tenantId,
        firstName: driver.firstName,
        lastName: driver.lastName,
        documentNumber: driver.documentNumber,
        permissions,
      },
    };
  }

  // Siempre responde con exito (aunque el correo no exista) para no revelar
  // que correos estan registrados. Invalida cualquier token previo del mismo
  // usuario al generar uno nuevo.
  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { email, status: "ACTIVE" } });
    if (!user) {
      return;
    }

    const rawToken = randomBytes(32).toString("base64url");
    const resetConfig = this.configService.get("passwordReset", { infer: true });
    const expiresAt = new Date(Date.now() + resetConfig.expirationMinutes * 60_000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: this.tokenService.hashToken(rawToken), passwordResetExpiresAt: expiresAt },
    });

    await this.auditService.record({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "AUTH_PASSWORD_RESET_REQUESTED",
      entityType: "User",
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const webAppUrl = this.configService.get("webAppUrl", { infer: true });
    const resetLink = `${webAppUrl}/reset-password?token=${rawToken}`;

    await this.mailService.send({
      to: user.email,
      subject: "Recuperar contrasena - VALTIC",
      text: `Hola ${user.firstName}, recibimos una solicitud para restablecer tu contrasena. Entra a este enlace (valido por ${resetConfig.expirationMinutes} minutos) para elegir una nueva: ${resetLink}\n\nSi no fuiste tu, ignora este correo.`,
      html: `
        <p>Hola ${user.firstName},</p>
        <p>Recibimos una solicitud para restablecer tu contrasena en VALTIC.</p>
        <p><a href="${resetLink}">Haz clic aqui para elegir una nueva contrasena</a> (valido por ${resetConfig.expirationMinutes} minutos).</p>
        <p>Si no fuiste tu, puedes ignorar este correo.</p>
      `,
    });
  }

  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const tokenHash = this.tokenService.hashToken(token);
    const user = await this.prisma.user.findFirst({ where: { passwordResetTokenHash: tokenHash } });

    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new UnauthorizedException({
        code: "AUTH_RESET_TOKEN_INVALID",
        message: "El enlace de recuperacion es invalido o ya expiro.",
      });
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Revoca todas las sesiones activas: si alguien mas tenia acceso a la
    // cuenta, un cambio de contrasena debe cerrarle la sesion tambien.
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditService.record({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "AUTH_PASSWORD_RESET_COMPLETED",
      entityType: "User",
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async refresh(
    rawToken: string,
    meta: RequestMeta,
  ): Promise<
    LoginResult &
      ({ actorKind: "user"; user: AdminLoginResult["user"] } | { actorKind: "driver"; driver: DriverLoginResult["driver"] })
  > {
    const tokenHash = this.tokenService.hashToken(rawToken);

    const userSession = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: {
        user: {
          include: {
            userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
          },
        },
      },
    });

    if (userSession) {
      if (userSession.expiresAt < new Date()) {
        throw new UnauthorizedException({ code: "AUTH_REFRESH_EXPIRED", message: "Sesion expirada." });
      }

      await this.prisma.refreshToken.update({ where: { id: userSession.id }, data: { revokedAt: new Date() } });

      const roles = userSession.user.userRoles.map((userRole) => userRole.role.name);
      const permissions = this.uniquePermissions(
        userSession.user.userRoles.flatMap((userRole) =>
          userRole.role.rolePermissions.map((rp) => rp.permission.key as PermissionKey),
        ),
      );

      const authenticatedUser: AuthenticatedUser = {
        sub: userSession.userId,
        kind: "user",
        tenantId: userSession.user.tenantId,
        roles,
        permissions,
      };

      const session = await this.issueSession(authenticatedUser, meta, { userId: userSession.userId });
      return {
        ...session,
        actorKind: "user",
        user: {
          id: userSession.user.id,
          tenantId: userSession.user.tenantId,
          firstName: userSession.user.firstName,
          lastName: userSession.user.lastName,
          email: userSession.user.email,
          roles,
          permissions,
        },
      };
    }

    const driverSession = await this.prisma.driverRefreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { driver: true },
    });

    if (driverSession) {
      if (driverSession.expiresAt < new Date()) {
        throw new UnauthorizedException({ code: "AUTH_REFRESH_EXPIRED", message: "Sesion expirada." });
      }

      await this.prisma.driverRefreshToken.update({
        where: { id: driverSession.id },
        data: { revokedAt: new Date() },
      });

      const authenticatedUser: AuthenticatedUser = {
        sub: driverSession.driverId,
        kind: "driver",
        tenantId: driverSession.driver.tenantId,
        roles: ["DRIVER"],
        permissions: TENANT_ROLE_DEFAULT_PERMISSIONS.DRIVER,
      };

      const session = await this.issueSession(authenticatedUser, meta, { driverId: driverSession.driverId });
      return {
        ...session,
        actorKind: "driver",
        driver: {
          id: driverSession.driver.id,
          tenantId: driverSession.driver.tenantId,
          firstName: driverSession.driver.firstName,
          lastName: driverSession.driver.lastName,
          documentNumber: driverSession.driver.documentNumber,
          permissions: TENANT_ROLE_DEFAULT_PERMISSIONS.DRIVER,
        },
      };
    }

    throw new UnauthorizedException({ code: "AUTH_REFRESH_INVALID", message: "Sesion invalida." });
  }

  async logout(rawToken: string, meta: RequestMeta): Promise<void> {
    const tokenHash = this.tokenService.hashToken(rawToken);

    const userSession = await this.prisma.refreshToken.findFirst({ where: { tokenHash, revokedAt: null } });
    if (userSession) {
      await this.prisma.refreshToken.update({ where: { id: userSession.id }, data: { revokedAt: new Date() } });
      const user = await this.prisma.user.findUnique({ where: { id: userSession.userId } });
      await this.auditService.record({
        tenantId: user?.tenantId,
        actorUserId: userSession.userId,
        action: "AUTH_LOGOUT",
        entityType: "User",
        entityId: userSession.userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return;
    }

    const driverSession = await this.prisma.driverRefreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { driver: true },
    });
    if (driverSession) {
      await this.prisma.driverRefreshToken.update({ where: { id: driverSession.id }, data: { revokedAt: new Date() } });
      await this.auditService.record({
        tenantId: driverSession.driver.tenantId,
        actorDriverId: driverSession.driverId,
        action: "AUTH_LOGOUT",
        entityType: "Driver",
        entityId: driverSession.driverId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }
  }

  async logoutAll(actor: AuthenticatedUser, meta: RequestMeta): Promise<void> {
    if (actor.kind === "user") {
      await this.prisma.refreshToken.updateMany({
        where: { userId: actor.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: "AUTH_LOGOUT_ALL",
        entityType: "User",
        entityId: actor.sub,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return;
    }
    await this.prisma.driverRefreshToken.updateMany({
      where: { driverId: actor.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.auditService.record({
      tenantId: actor.tenantId,
      actorDriverId: actor.sub,
      action: "AUTH_LOGOUT_ALL",
      entityType: "Driver",
      entityId: actor.sub,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  private async issueSession(
    user: AuthenticatedUser,
    meta: RequestMeta,
    ids: { userId?: string; driverId?: string },
  ): Promise<LoginResult> {
    const accessToken = await this.tokenService.signAccessToken(user);
    const { token: refreshToken, tokenHash, expiresAt } = this.tokenService.generateRefreshToken();

    if (ids.userId) {
      await this.prisma.refreshToken.create({
        data: {
          userId: ids.userId,
          tokenHash,
          deviceId: meta.deviceId,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
          expiresAt,
        },
      });
    } else if (ids.driverId) {
      await this.prisma.driverRefreshToken.create({
        data: {
          driverId: ids.driverId,
          tokenHash,
          deviceId: meta.deviceId,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
          expiresAt,
        },
      });
    }

    return { accessToken, refreshToken, refreshTokenExpiresAt: expiresAt };
  }

  private uniquePermissions(permissions: PermissionKey[]): PermissionKey[] {
    return Array.from(new Set(permissions));
  }
}
