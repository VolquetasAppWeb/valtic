import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class DashboardQueryDto {
  // Ventana del grafico de viajes completados por dia (filtro del dashboard).
  @ApiPropertyOptional({ default: 14, minimum: 7, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(90)
  days?: number;
}
