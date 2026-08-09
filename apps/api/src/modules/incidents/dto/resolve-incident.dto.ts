import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

const RESOLUTION_STATUSES = ["IN_PROGRESS", "RESOLVED", "DISMISSED"] as const;

export class ResolveIncidentDto {
  @ApiProperty({ enum: RESOLUTION_STATUSES })
  @IsIn(RESOLUTION_STATUSES)
  status!: (typeof RESOLUTION_STATUSES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  resolutionNotes?: string;
}
