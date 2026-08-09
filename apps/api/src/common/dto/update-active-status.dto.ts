import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

const ACTIVE_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export class UpdateActiveStatusDto {
  @ApiProperty({ enum: ACTIVE_STATUSES })
  @IsIn(ACTIVE_STATUSES)
  status!: (typeof ACTIVE_STATUSES)[number];
}
