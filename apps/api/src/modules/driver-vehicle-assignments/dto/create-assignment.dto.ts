import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class CreateAssignmentDto {
  @ApiProperty()
  @IsUUID()
  driverId!: string;

  @ApiProperty()
  @IsUUID()
  vehicleId!: string;
}
