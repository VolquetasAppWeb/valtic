import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from "class-validator";

const INCIDENT_TYPES = [
  "MECHANICAL_FAILURE",
  "TRAFFIC_ACCIDENT",
  "DELAY",
  "WEATHER",
  "SECURITY",
  "CARGO_ISSUE",
  "ROAD_CLOSURE",
  "OTHER",
] as const;

const INCIDENT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export class CreateIncidentDto {
  @ApiProperty({ required: false, description: "Requerido si el reporte no lo hace el propio conductor" })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiProperty({ enum: INCIDENT_TYPES })
  @IsIn(INCIDENT_TYPES)
  type!: (typeof INCIDENT_TYPES)[number];

  @ApiProperty({ enum: INCIDENT_SEVERITIES })
  @IsIn(INCIDENT_SEVERITIES)
  severity!: (typeof INCIDENT_SEVERITIES)[number];

  @ApiProperty()
  @IsString()
  @MinLength(5, { message: "La descripcion debe tener minimo 5 caracteres" })
  description!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
