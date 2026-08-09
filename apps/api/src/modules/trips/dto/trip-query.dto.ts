import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const TRIP_STATUSES = [
  "DRAFT",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_LOAD",
  "LOADING",
  "LOADED",
  "EN_ROUTE_TO_UNLOAD",
  "UNLOADING",
  "PENDING_VALIDATION",
  "COMPLETED",
  "INCLUDED_IN_SETTLEMENT",
  "SETTLED",
  "UNDER_REVIEW",
  "BLOCKED_BY_INCIDENT",
  "MANUALLY_CLOSED",
  "CANCELLED",
  "REJECTED",
] as const;

export class TripQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TRIP_STATUSES })
  @IsOptional()
  @IsIn(TRIP_STATUSES)
  status?: (typeof TRIP_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
