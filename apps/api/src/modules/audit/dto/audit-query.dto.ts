import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const ACTOR_KINDS = ["USER", "DRIVER", "SYSTEM"] as const;

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ACTOR_KINDS, description: "Filtra por tipo de actor: admin/dispatcher, conductor o sistema" })
  @IsOptional()
  @IsIn(ACTOR_KINDS)
  actorKind?: (typeof ACTOR_KINDS)[number];

  @ApiPropertyOptional({ description: "Ej: Trip, Settlement, User" })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: "Ej: AUTH_LOGIN_FAILED, TRIP_CANCELLED" })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  // Solo tiene efecto para actores con audit:read-global (SUPER_ADMIN); se
  // ignora si el actor esta scopeado a su propio tenant.
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: "2026-08-01" })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2026-08-31" })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
