import { ApiProperty } from "@nestjs/swagger";
import { IsEmail } from "class-validator";

export class ForgotPasswordDto {
  @ApiProperty({ example: "admin@contratistademo.com" })
  @IsEmail({}, { message: "Correo invalido" })
  email!: string;
}
