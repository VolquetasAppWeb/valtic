import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, MinLength } from "class-validator";

export class CreateProjectDto {
  @ApiProperty({ example: "Via Perimetral Norte" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: "OBRA-001" })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, example: "Alcaldia Municipal" })
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiProperty({ example: "2026-01-15" })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ required: false, example: "2026-12-15" })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
