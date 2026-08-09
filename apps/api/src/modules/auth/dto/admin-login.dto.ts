import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class AdminLoginDto {
  @ApiProperty({ example: "admin@contratistademo.com" })
  @IsEmail({}, { message: "Correo invalido" })
  email!: string;

  @ApiProperty({ example: "AdminDemo123!" })
  @IsString()
  @MinLength(8, { message: "La contrasena debe tener minimo 8 caracteres" })
  password!: string;

  @ApiProperty({ required: false, example: "web-chrome-desktop" })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
