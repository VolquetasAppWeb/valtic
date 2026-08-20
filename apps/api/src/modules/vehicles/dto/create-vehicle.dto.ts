import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, Min, MinLength } from "class-validator";

const VEHICLE_TYPES = ["DUMP_TRUCK", "DOUBLE_TRAILER", "MINI_DUMP_TRUCK", "TRACTOR_TRAILER", "OTHER"] as const;
const CAPACITY_UNITS = ["TON", "CUBIC_METER"] as const;
// 3 letras + guion + 3 numeros (ej. "ABC-123"), formato estandar de placa
// vehicular en Colombia para carga.
const PLATE_PATTERN = /^[A-Za-z]{3}-\d{3}$/;

export class CreateVehicleDto {
  @ApiPropertyOptional({
    description: "Si el actor es DISPATCHER y se omite, se usa automaticamente su propio propietario",
  })
  @IsOptional()
  @IsUUID()
  fleetOwnerId?: string;

  @ApiProperty({ example: "ABC-123" })
  @IsString()
  @Matches(PLATE_PATTERN, { message: "La placa debe tener el formato XXX-111 (3 letras, guion, 3 numeros)." })
  plate!: string;

  @ApiProperty({ enum: VEHICLE_TYPES })
  @IsIn(VEHICLE_TYPES)
  vehicleType!: (typeof VEHICLE_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  model?: string;

  @ApiProperty({ example: 2020 })
  @IsInt()
  @Min(1970)
  @Max(2100)
  year!: number;

  @ApiPropertyOptional({ example: 14 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  capacity?: number;

  @ApiPropertyOptional({ enum: CAPACITY_UNITS })
  @IsOptional()
  @IsIn(CAPACITY_UNITS)
  capacityUnit?: (typeof CAPACITY_UNITS)[number];

  @ApiPropertyOptional({
    example: "10034039969",
    description: "Numero de la tarjeta de propiedad (LICENCIA DE TRANSITO No) — identifica el vehiculo",
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  licenseNumber?: string;

  // Resto de campos de la tarjeta de propiedad (frente y reverso) — todos
  // opcionales, en texto libre, autocompletados por el registro con IA
  // (ver POST /vehicles/extract-registration). Sin validacion de formato
  // mas alla de ser texto: vienen de OCR best-effort.
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() licenseBarcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleClass?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodyType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fuelType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() loadCapacity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() engineNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chassisNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerDocumentNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mobilityRestriction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() armor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() horsepower?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() importDeclaration?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() importDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() doors?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() propertyLimitation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registrationDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() licenseIssueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() licenseExpirationDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() transitAuthority?: string;
}
