import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const DRIVER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

export class DriverQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DRIVER_STATUSES })
  @IsOptional()
  @IsIn(DRIVER_STATUSES)
  status?: (typeof DRIVER_STATUSES)[number];
}
