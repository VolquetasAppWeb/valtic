import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";

export class ResetDriverPinDto {
  @ApiProperty({ example: "654321" })
  @Matches(/^\d{6}$/, { message: "El PIN debe tener exactamente 6 digitos" })
  newPin!: string;
}
