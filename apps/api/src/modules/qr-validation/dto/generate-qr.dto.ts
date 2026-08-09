import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class GenerateQrDto {
  @ApiProperty()
  @IsUUID()
  operationalSiteId!: string;
}
