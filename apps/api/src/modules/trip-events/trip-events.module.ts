import { Module } from "@nestjs/common";
import { TripEventsService } from "./trip-events.service";

@Module({
  providers: [TripEventsService],
  exports: [TripEventsService],
})
export class TripEventsModule {}
