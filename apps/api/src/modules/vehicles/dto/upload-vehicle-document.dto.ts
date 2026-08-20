import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

// Etiqueta opcional del tipo de foto — la usa el registro automatico para
// marcar frente/reverso de la tarjeta de propiedad y la foto de la
// volqueta; subidas sueltas desde "Ver documentos" la omiten y quedan como
// OTHER (default en el schema).
export class UploadVehicleDocumentDto {
  @ApiPropertyOptional({ enum: ["REGISTRATION_FRONT", "REGISTRATION_BACK", "VEHICLE_PHOTO", "OTHER"] })
  @IsOptional()
  @IsEnum(["REGISTRATION_FRONT", "REGISTRATION_BACK", "VEHICLE_PHOTO", "OTHER"])
  kind?: "REGISTRATION_FRONT" | "REGISTRATION_BACK" | "VEHICLE_PHOTO" | "OTHER";
}
