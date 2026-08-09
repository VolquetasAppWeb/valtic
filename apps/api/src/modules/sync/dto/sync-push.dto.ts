import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { DRIVER_ACTIONS, type DriverActionType } from "../../trips/domain/driver-actions";

const SYNC_EVENT_KINDS = ["TRIP_ACTION", "LOCATION"] as const;

export class SyncLocationDto {
  @ApiProperty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  accuracy!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  altitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  speed?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  heading?: number;
}

export class SyncEventDto {
  @ApiProperty()
  @IsString()
  eventId!: string;

  @ApiProperty({ enum: SYNC_EVENT_KINDS })
  @IsIn(SYNC_EVENT_KINDS)
  kind!: (typeof SYNC_EVENT_KINDS)[number];

  @ApiProperty()
  @IsUUID()
  tripId!: string;

  @ApiProperty()
  @IsString()
  deviceId!: string;

  @ApiProperty()
  @IsDateString()
  capturedAt!: string;

  @ApiProperty({ required: false, enum: DRIVER_ACTIONS })
  @IsOptional()
  @IsIn(DRIVER_ACTIONS)
  action?: DriverActionType;

  @ApiProperty({ required: false, type: SyncLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SyncLocationDto)
  location?: SyncLocationDto;
}

export class SyncPushDto {
  @ApiProperty({ type: [SyncEventDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncEventDto)
  events!: SyncEventDto[];
}
