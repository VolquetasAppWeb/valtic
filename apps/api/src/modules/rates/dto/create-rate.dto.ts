import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsIn, IsNumber, IsOptional, IsUUID, Min } from "class-validator";

const RATE_TYPES = ["PER_TRIP", "PER_TON", "PER_CUBIC_METER", "PER_KILOMETER", "FIXED"] as const;
const VEHICLE_TYPES = ["DUMP_TRUCK", "DOUBLE_TRAILER", "MINI_DUMP_TRUCK", "TRACTOR_TRAILER", "OTHER"] as const;

export class CreateRateDto {
  @ApiProperty()
  @IsUUID()
  projectId!: string;

  @ApiProperty()
  @IsUUID()
  originSiteId!: string;

  @ApiProperty()
  @IsUUID()
  destinationSiteId!: string;

  @ApiProperty()
  @IsUUID()
  materialId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  fleetOwnerId?: string;

  @ApiProperty({ required: false, enum: VEHICLE_TYPES })
  @IsOptional()
  @IsIn(VEHICLE_TYPES)
  vehicleType?: (typeof VEHICLE_TYPES)[number];

  @ApiProperty({ enum: RATE_TYPES })
  @IsIn(RATE_TYPES)
  rateType!: (typeof RATE_TYPES)[number];

  @ApiProperty({ example: 85000 })
  @IsNumber()
  @Min(0)
  value!: number;

  @ApiProperty({ example: "2026-01-01" })
  @IsDateString()
  validFrom!: string;

  @ApiProperty({ required: false, example: "2026-12-31" })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
