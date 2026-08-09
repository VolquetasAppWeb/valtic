import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import type { AppConfig } from "../../config/configuration";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

export interface RefreshTokenPair {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async signAccessToken(user: AuthenticatedUser): Promise<string> {
    const jwtConfig = this.configService.get("jwt", { infer: true });
    return this.jwtService.signAsync(
      { ...user },
      { secret: jwtConfig.accessSecret, expiresIn: jwtConfig.accessExpiresIn },
    );
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const jwtConfig = this.configService.get("jwt", { infer: true });
    const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(token, {
      secret: jwtConfig.accessSecret,
    });
    return {
      sub: payload.sub,
      kind: payload.kind,
      tenantId: payload.tenantId,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }

  generateRefreshToken(): RefreshTokenPair {
    const jwtConfig = this.configService.get("jwt", { infer: true });
    const token = randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + this.parseDurationMs(jwtConfig.refreshExpiresIn));
    return { token, tokenHash: this.hashToken(token), expiresAt };
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private parseDurationMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }
    const value = Number(match[1]);
    const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * (unitMs[match[2] as string] ?? 86_400_000);
  }
}
