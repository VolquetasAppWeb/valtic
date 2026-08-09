import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, IsUrl, MinLength } from "class-validator";

export class CreateTenantDto {
  @ApiProperty({ example: "Contratista Demo" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: "Contratista Demo S.A.S." })
  @IsString()
  @MinLength(2)
  legalName!: string;

  @ApiProperty({ example: "900123456-7" })
  @IsString()
  @MinLength(3)
  taxId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;
}
