import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const INCIDENT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"] as const;
const INCIDENT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export class IncidentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: INCIDENT_STATUSES })
  @IsOptional()
  @IsIn(INCIDENT_STATUSES)
  status?: (typeof INCIDENT_STATUSES)[number];

  @ApiPropertyOptional({ enum: INCIDENT_SEVERITIES })
  @IsOptional()
  @IsIn(INCIDENT_SEVERITIES)
  severity?: (typeof INCIDENT_SEVERITIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;
}
