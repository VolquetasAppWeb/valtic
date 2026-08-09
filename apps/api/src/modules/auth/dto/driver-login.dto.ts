import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MinLength } from "class-validator";

export class DriverLoginDto {
  @ApiProperty({ example: "1020304050" })
  @IsString()
  @MinLength(4, { message: "Documento o celular invalido" })
  documentOrPhone!: string;

  @ApiProperty({ example: "123456" })
  @Matches(/^\d{6}$/, { message: "El PIN debe tener exactamente 6 digitos" })
  pin!: string;

  @ApiProperty({ required: false, example: "android-mi-a2" })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
