import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

const REVIEW_DECISIONS = ["APPROVE", "REJECT"] as const;

export class ReviewTripDto {
  @ApiProperty({ enum: REVIEW_DECISIONS })
  @IsIn(REVIEW_DECISIONS)
  decision!: (typeof REVIEW_DECISIONS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
