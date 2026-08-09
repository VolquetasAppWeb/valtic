import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const VEHICLE_STATUSES = ["ACTIVE", "MAINTENANCE", "INACTIVE"] as const;

export class VehicleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: VEHICLE_STATUSES })
  @IsOptional()
  @IsIn(VEHICLE_STATUSES)
  status?: (typeof VEHICLE_STATUSES)[number];
}
