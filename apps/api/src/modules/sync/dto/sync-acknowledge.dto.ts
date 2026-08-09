import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";

export class SyncAcknowledgeDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  eventIds!: string[];
}
