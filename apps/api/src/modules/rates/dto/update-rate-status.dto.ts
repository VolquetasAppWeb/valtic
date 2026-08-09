import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

const RATE_STATUSES = ["ACTIVE", "EXPIRED", "INACTIVE"] as const;

export class UpdateRateStatusDto {
  @ApiProperty({ enum: RATE_STATUSES })
  @IsIn(RATE_STATUSES)
  status!: (typeof RATE_STATUSES)[number];
}
