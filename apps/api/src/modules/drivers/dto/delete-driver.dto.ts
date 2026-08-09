import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class DeleteDriverDto {
  @ApiPropertyOptional({ description: "Motivo de la eliminacion, queda en el historial" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
