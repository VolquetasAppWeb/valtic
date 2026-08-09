import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { DRIVER_ACTIONS, type DriverActionType } from "../domain/driver-actions";

export class DriverActionDto {
  @ApiProperty({ enum: DRIVER_ACTIONS })
  @IsIn(DRIVER_ACTIONS)
  action!: DriverActionType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
