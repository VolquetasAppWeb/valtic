import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

const DRIVER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

export class UpdateDriverStatusDto {
  @ApiProperty({ enum: DRIVER_STATUSES })
  @IsIn(DRIVER_STATUSES)
  status!: (typeof DRIVER_STATUSES)[number];
}
