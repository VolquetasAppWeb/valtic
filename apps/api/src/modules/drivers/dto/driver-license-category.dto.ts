import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

// Una fila de la tabla "CATEGORIAS AUTORIZADAS" de la licencia — cada
// categoria trae su propia clase de vehiculo, vigencia y servicio (ver
// DriverLicenseCategoryEntry en ocr.service.ts).
export class DriverLicenseCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleClass?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiration?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceType?: string;
}
