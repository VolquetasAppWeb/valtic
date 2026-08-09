import { Module } from "@nestjs/common";
import { TripsController } from "./trips.controller";
import { TripsService } from "./trips.service";
import { TripEventsModule } from "../trip-events/trip-events.module";
import { OcrService } from "./ocr/ocr.service";

@Module({
  imports: [TripEventsModule],
  controllers: [TripsController],
  providers: [TripsService, OcrService],
  exports: [TripsService],
})
export class TripsModule {}
