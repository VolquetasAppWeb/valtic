import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const SITE_TYPES = ["LOAD", "UNLOAD", "BOTH"] as const;
const RATE_TYPES = ["PER_TRIP", "PER_TON", "PER_CUBIC_METER", "PER_KILOMETER", "FIXED"] as const;
const VEHICLE_TYPES = ["DUMP_TRUCK", "DOUBLE_TRAILER", "MINI_DUMP_TRUCK", "TRACTOR_TRAILER", "OTHER"] as const;

// Sin "name": la obra no tiene nombre propio en este flujo — el
// identificador es el codigo, generado (y editable) a partir de los
// nombres de cargue/descargue. OperationsService.quickSetup deriva el
// campo `name` de la tabla (obligatorio ahi por compatibilidad con el
// resto de la app) a partir de esos mismos puntos, no de este DTO.
export class QuickSetupProjectDto {
  @ApiProperty() @IsString() @MinLength(1) code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientName?: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
}

// Coordenadas resueltas en el frontend (busqueda de direccion + ajuste
// manual en el mapa) — Gemini no las puede inventar con la precision que
// necesita una geocerca real, asi que el borrador de IA nunca las trae.
export class QuickSetupSiteDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiProperty({ enum: SITE_TYPES }) @IsIn(SITE_TYPES) type!: (typeof SITE_TYPES)[number];
  @ApiProperty() @IsString() @MinLength(3) address!: string;
  @ApiProperty() @IsNumber() latitude!: number;
  @ApiProperty() @IsNumber() longitude!: number;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @IsInt() @Min(10) geofenceRadius?: number;
}

// origin/destinationSiteIndex referencian por posicion el arreglo `sites`
// del mismo payload (todavia no existen ids reales antes de crear la obra).
export class QuickSetupRateDto {
  @ApiProperty() @IsInt() @Min(0) originSiteIndex!: number;
  @ApiProperty() @IsInt() @Min(0) destinationSiteIndex!: number;
  @ApiProperty() @IsString() @MinLength(2) materialName!: string;
  @ApiProperty({ enum: RATE_TYPES }) @IsIn(RATE_TYPES) rateType!: (typeof RATE_TYPES)[number];
  @ApiProperty() @IsNumber() @Min(0) value!: number;
  @ApiPropertyOptional({ enum: VEHICLE_TYPES, description: "Tipo de vehiculo de esta tarifa especifica, si aplica solo a un tipo" })
  @IsOptional()
  @IsIn(VEHICLE_TYPES)
  vehicleType?: (typeof VEHICLE_TYPES)[number];
}

export class QuickSetupDto {
  @ApiProperty({ type: QuickSetupProjectDto })
  @ValidateNested()
  @Type(() => QuickSetupProjectDto)
  project!: QuickSetupProjectDto;

  @ApiProperty({ type: [QuickSetupSiteDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuickSetupSiteDto)
  sites!: QuickSetupSiteDto[];

  @ApiPropertyOptional({ type: [QuickSetupRateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuickSetupRateDto)
  rates?: QuickSetupRateDto[];
}
