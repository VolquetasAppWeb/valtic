import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from "class-validator";

const VEHICLE_TYPES = ["DUMP_TRUCK", "DOUBLE_TRAILER", "MINI_DUMP_TRUCK", "TRACTOR_TRAILER", "OTHER"] as const;
const CAPACITY_UNITS = ["TON", "CUBIC_METER"] as const;

export class CreateVehicleDto {
  @ApiPropertyOptional({
    description: "Si el actor es DISPATCHER y se omite, se usa automaticamente su propio propietario",
  })
  @IsOptional()
  @IsUUID()
  fleetOwnerId?: string;

  @ApiProperty({ example: "ABC123" })
  @IsString()
  @MinLength(5)
  plate!: string;

  @ApiProperty({ enum: VEHICLE_TYPES })
  @IsIn(VEHICLE_TYPES)
  vehicleType!: (typeof VEHICLE_TYPES)[number];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  brand!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  model!: string;

  @ApiProperty({ example: 2020 })
  @IsInt()
  @Min(1970)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 14 })
  @IsNumber()
  @Min(0)
  capacity!: number;

  @ApiProperty({ enum: CAPACITY_UNITS })
  @IsIn(CAPACITY_UNITS)
  capacityUnit!: (typeof CAPACITY_UNITS)[number];
}
