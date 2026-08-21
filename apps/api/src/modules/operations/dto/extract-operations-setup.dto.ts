import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

// El texto pegado llega como campo de formulario junto a las fotos
// (multipart/form-data) — al menos uno de los dos (texto o foto) debe venir,
// se valida en el controller.
export class ExtractOperationsSetupDto {
  @ApiPropertyOptional({ description: "Texto de la orden de trabajo/cotizacion pegado a mano" })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  text?: string;
}
