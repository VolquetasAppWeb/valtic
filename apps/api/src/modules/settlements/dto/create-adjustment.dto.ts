import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNumber, IsString, MinLength } from "class-validator";

const ADJUSTMENT_TYPES = ["BONUS", "DEDUCTION", "CORRECTION"] as const;

export class CreateAdjustmentDto {
  @ApiProperty({ enum: ADJUSTMENT_TYPES })
  @IsIn(ADJUSTMENT_TYPES)
  type!: (typeof ADJUSTMENT_TYPES)[number];

  @ApiProperty()
  @IsString()
  @MinLength(3)
  description!: string;

  @ApiProperty({ description: "Positivo para BONUS, positivo o negativo segun el caso para CORRECTION; DEDUCTION siempre resta." })
  @IsNumber()
  amount!: number;
}
