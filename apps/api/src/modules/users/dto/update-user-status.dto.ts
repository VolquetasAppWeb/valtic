import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

const USER_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export class UpdateUserStatusDto {
  @ApiProperty({ enum: USER_STATUSES })
  @IsIn(USER_STATUSES)
  status!: (typeof USER_STATUSES)[number];
}
