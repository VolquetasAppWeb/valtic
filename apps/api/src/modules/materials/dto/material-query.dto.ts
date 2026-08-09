import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const MATERIAL_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export class MaterialQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MATERIAL_STATUSES })
  @IsOptional()
  @IsIn(MATERIAL_STATUSES)
  status?: (typeof MATERIAL_STATUSES)[number];
}
