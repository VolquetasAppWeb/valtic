import { Controller, Get, HttpStatus, Inject, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { Public } from "../common/decorators/public.decorator";

interface HealthCheckResult {
  status: "ok" | "degraded";
  timestamp: string;
  services: {
    database: "up" | "down";
    redis: "up" | "down";
  };
}

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Estado de salud del sistema (API, base de datos, Redis)" })
  async check(@Res() res: Response): Promise<void> {
    const [databaseUp, redisUp] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const result: HealthCheckResult = {
      status: databaseUp && redisUp ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: databaseUp ? "up" : "down",
        redis: redisUp ? "up" : "down",
      },
    };

    const httpStatus = result.status === "ok" ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(httpStatus).json(result);
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === "PONG";
    } catch {
      return false;
    }
  }
}
