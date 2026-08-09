import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsIn, IsString, Matches, MinLength } from "class-validator";

const DOCUMENT_TYPES = ["CC", "CE", "PASSPORT", "NIT"] as const;

export class CreateDriverDto {
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  documentType!: (typeof DOCUMENT_TYPES)[number];

  @ApiProperty({ example: "1020304050" })
  @IsString()
  @MinLength(4)
  documentNumber!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  lastName!: string;

  @ApiProperty({ example: "3001234567" })
  @IsString()
  @MinLength(7)
  phone!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  licenseNumber!: string;

  @ApiProperty({ example: "2027-01-01" })
  @IsDateString()
  licenseExpiration!: string;

  @ApiProperty({ example: "123456", description: "PIN inicial de 6 digitos" })
  @Matches(/^\d{6}$/, { message: "El PIN debe tener exactamente 6 digitos" })
  pin!: string;
}
