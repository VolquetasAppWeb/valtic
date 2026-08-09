import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

const TENANT_STATUSES = ["ACTIVE", "SUSPENDED", "BLOCKED"] as const;

export class UpdateTenantStatusDto {
  @ApiProperty({ enum: TENANT_STATUSES })
  @IsIn(TENANT_STATUSES)
  status!: (typeof TENANT_STATUSES)[number];
}
