import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { DriverLicenseCategoryDto } from "./driver-license-category.dto";

const DOCUMENT_TYPES = ["CC", "CE", "PASSPORT", "NIT"] as const;

// El PIN ya no lo escribe el despachador: se genera solo en el backend
// (ver DriversService.create) para que no queden PIN triviales o
// repetidos entre conductores, y se devuelve una unica vez en la
// respuesta de creacion para que el despachador se lo pueda compartir.
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

  @ApiProperty()
  @IsString()
  @MinLength(2)
  licenseNumber!: string;

  @ApiPropertyOptional({ example: "B2, C2", description: "Codigos de categoria autorizados, unidos por coma" })
  @IsOptional()
  @IsString()
  licenseCategory?: string;

  @ApiProperty({ example: "2027-01-01" })
  @IsDateString()
  licenseExpiration!: string;

  @ApiPropertyOptional({
    type: [DriverLicenseCategoryDto],
    description: "Tabla de categorias autorizadas leida de la licencia, una fila por categoria con su propia vigencia/servicio",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriverLicenseCategoryDto)
  licenseCategories?: DriverLicenseCategoryDto[];

  // Resto de campos de cedula/licencia — todos opcionales, en texto libre,
  // autocompletados por el registro con IA (ver POST /drivers/extract-cedula
  // y /drivers/extract-license). Sin validacion de formato mas alla de ser
  // texto: vienen de OCR best-effort.
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() height?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sex?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() birthDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bloodType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() birthPlace?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuePlace?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentExpirationDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supportNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mrz?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() licenseIssuingAuthority?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() licenseRestrictions?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() licenseIssueDate?: string;
}
