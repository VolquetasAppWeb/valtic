import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsISO8601, IsLatitude, IsLongitude, IsOptional } from "class-validator";

// Llega junto con el archivo en el mismo multipart/form-data. Todos
// opcionales: si el conductor no tiene GPS disponible en ese momento, el
// vale se sube igual, solo sin esa metadata de ubicacion/hora de captura.
export class UploadVoucherDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ description: "Momento en que se tomo la foto (no cuando se subio al servidor)" })
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;
}
