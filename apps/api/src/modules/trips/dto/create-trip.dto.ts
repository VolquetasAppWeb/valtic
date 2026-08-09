import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNumber, IsOptional, IsUUID, Min } from "class-validator";

const QUANTITY_UNITS = ["TON", "CUBIC_METER"] as const;

export class CreateTripDto {
  @ApiProperty()
  @IsUUID()
  projectId!: string;

  @ApiProperty()
  @IsUUID()
  driverId!: string;

  @ApiProperty()
  @IsUUID()
  vehicleId!: string;

  @ApiProperty()
  @IsUUID()
  originSiteId!: string;

  @ApiProperty()
  @IsUUID()
  destinationSiteId!: string;

  @ApiProperty()
  @IsUUID()
  materialId!: string;

  @ApiProperty({ required: false, example: 14 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedQuantity?: number;

  @ApiProperty({ required: false, enum: QUANTITY_UNITS })
  @IsOptional()
  @IsIn(QUANTITY_UNITS)
  quantityUnit?: (typeof QUANTITY_UNITS)[number];
}
