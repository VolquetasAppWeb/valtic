import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const PROJECT_STATUSES = ["PLANNED", "ACTIVE", "PAUSED", "CLOSED"] as const;

export class ProjectQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PROJECT_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: (typeof PROJECT_STATUSES)[number];
}
