import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

const FLEET_OWNER_TYPES = ["NATURAL_PERSON", "LEGAL_ENTITY"] as const;

export class CreateFleetOwnerDto {
  @ApiProperty({ enum: FLEET_OWNER_TYPES })
  @IsIn(FLEET_OWNER_TYPES)
  type!: (typeof FLEET_OWNER_TYPES)[number];

  @ApiProperty({ example: "900123456-7" })
  @IsString()
  @MinLength(3)
  documentNumber!: string;

  @ApiProperty({ example: "Transportes El Progreso" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: "3001234567" })
  @IsString()
  @MinLength(7)
  phone!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ required: false, example: "SAVINGS" })
  @IsOptional()
  @IsString()
  bankAccountType?: string;

  @ApiProperty({ required: false, example: "4521" })
  @IsOptional()
  @IsString()
  @MinLength(4)
  bankAccountLastFour?: string;

  @ApiPropertyOptional({ description: "Despachador al que se asigna este propietario; sin asignar, ningun despachador lo vera" })
  @IsOptional()
  @IsUUID()
  dispatcherId?: string;
}
