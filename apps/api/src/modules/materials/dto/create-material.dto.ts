import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class CreateMaterialDto {
  @ApiProperty({ example: "Recebo comun" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: "REC-001" })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: "m3" })
  @IsString()
  @MinLength(1)
  unit!: string;
}
