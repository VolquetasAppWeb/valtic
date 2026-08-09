import { Module } from "@nestjs/common";
import { IncidentsController } from "./incidents.controller";
import { IncidentsService } from "./incidents.service";
import { TripsModule } from "../trips/trips.module";

@Module({
  imports: [TripsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
