import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ManualCloseTripDto {
  @ApiProperty({ example: "Perdida de senal GPS del conductor, se confirmo la entrega por telefono." })
  @IsString()
  @MinLength(5, { message: "El motivo debe tener minimo 5 caracteres" })
  reason!: string;
}
