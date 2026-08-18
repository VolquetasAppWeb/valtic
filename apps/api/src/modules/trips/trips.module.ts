import { Module } from "@nestjs/common";
import { TripsController } from "./trips.controller";
import { TripsService } from "./trips.service";
import { TripEventsModule } from "../trip-events/trip-events.module";

@Module({
  imports: [TripEventsModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
