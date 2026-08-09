import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class CancelTripDto {
  @ApiProperty({ example: "El cliente cancelo el pedido de material." })
  @IsString()
  @MinLength(5, { message: "El motivo debe tener minimo 5 caracteres" })
  reason!: string;
}
