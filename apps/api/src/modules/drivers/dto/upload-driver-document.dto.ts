import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

// Etiqueta opcional del tipo de foto — la usa el registro automatico para
// marcar frente/reverso de cedula y licencia; subidas sueltas la omiten y
// quedan como OTHER (default en el schema).
export class UploadDriverDocumentDto {
  @ApiPropertyOptional({ enum: ["CEDULA_FRONT", "CEDULA_BACK", "LICENSE_FRONT", "LICENSE_BACK", "OTHER"] })
  @IsOptional()
  @IsEnum(["CEDULA_FRONT", "CEDULA_BACK", "LICENSE_FRONT", "LICENSE_BACK", "OTHER"])
  kind?: "CEDULA_FRONT" | "CEDULA_BACK" | "LICENSE_FRONT" | "LICENSE_BACK" | "OTHER";
}
