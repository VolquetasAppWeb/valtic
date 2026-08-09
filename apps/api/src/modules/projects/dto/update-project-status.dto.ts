import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

const PROJECT_STATUSES = ["PLANNED", "ACTIVE", "PAUSED", "CLOSED"] as const;

export class UpdateProjectStatusDto {
  @ApiProperty({ enum: PROJECT_STATUSES })
  @IsIn(PROJECT_STATUSES)
  status!: (typeof PROJECT_STATUSES)[number];
}
