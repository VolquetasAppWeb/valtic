import { Module } from "@nestjs/common";
import { SettlementsController } from "./settlements.controller";
import { SettlementsService } from "./settlements.service";
import { TripsModule } from "../trips/trips.module";

@Module({
  imports: [TripsModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
})
export class SettlementsModule {}
