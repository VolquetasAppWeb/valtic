import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsUUID } from "class-validator";

export class SettlementPeriodDto {
  @ApiProperty()
  @IsUUID()
  fleetOwnerId!: string;

  @ApiProperty({ example: "2026-01-01" })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: "2026-01-31" })
  @IsDateString()
  periodEnd!: string;
}
