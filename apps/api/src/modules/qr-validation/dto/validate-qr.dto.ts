import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsString, IsUUID, Max, Min } from "class-validator";

export class ValidateQrDto {
  @ApiProperty({ description: "Token codificado del QR (o ingresado manualmente en desarrollo)" })
  @IsString()
  token!: string;

  @ApiProperty()
  @IsUUID()
  tripId!: string;

  @ApiProperty()
  @IsString()
  deviceId!: string;

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

  @ApiProperty()
  @IsDateString()
  capturedAt!: string;
}
