import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class RequestCloseCodeDto {
  @ApiProperty()
  @IsUUID()
  tripId!: string;
}
