import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

const VEHICLE_STATUSES = ["ACTIVE", "MAINTENANCE", "INACTIVE"] as const;

export class UpdateVehicleStatusDto {
  @ApiProperty({ enum: VEHICLE_STATUSES })
  @IsIn(VEHICLE_STATUSES)
  status!: (typeof VEHICLE_STATUSES)[number];
}
