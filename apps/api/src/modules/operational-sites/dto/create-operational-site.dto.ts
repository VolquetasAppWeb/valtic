import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, IsNumber, IsString, IsUUID, Max, Min, MinLength } from "class-validator";

const SITE_TYPES = ["LOAD", "UNLOAD", "BOTH"] as const;

export class CreateOperationalSiteDto {
  @ApiProperty()
  @IsUUID()
  projectId!: string;

  @ApiProperty({ example: "Cantera Norte" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: SITE_TYPES })
  @IsIn(SITE_TYPES)
  type!: (typeof SITE_TYPES)[number];

  @ApiProperty({ example: "Km 5 via Norte" })
  @IsString()
  @MinLength(3)
  address!: string;

  @ApiProperty({ example: 4.710989 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: -74.072092 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiProperty({ example: 100, description: "Radio de geocerca en metros" })
  @IsInt()
  @Min(10)
  @Max(2000)
  geofenceRadius!: number;
}
