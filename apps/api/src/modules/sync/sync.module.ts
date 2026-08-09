import { Module } from "@nestjs/common";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";
import { TripsModule } from "../trips/trips.module";
import { LocationsModule } from "../locations/locations.module";

@Module({
  imports: [TripsModule, LocationsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
