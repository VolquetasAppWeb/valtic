import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const FLEET_OWNER_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export class FleetOwnerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FLEET_OWNER_STATUSES })
  @IsOptional()
  @IsIn(FLEET_OWNER_STATUSES)
  status?: (typeof FLEET_OWNER_STATUSES)[number];
}
