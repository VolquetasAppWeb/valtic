import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const SETTLEMENT_STATUSES = ["DRAFT", "APPROVED", "PAID", "CANCELLED"] as const;

export class SettlementQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  fleetOwnerId?: string;

  @ApiPropertyOptional({ enum: SETTLEMENT_STATUSES })
  @IsOptional()
  @IsIn(SETTLEMENT_STATUSES)
  status?: (typeof SETTLEMENT_STATUSES)[number];
}
