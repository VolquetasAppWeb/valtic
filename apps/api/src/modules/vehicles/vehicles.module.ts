import { Module } from "@nestjs/common";
import { VehiclesController } from "./vehicles.controller";
import { VehiclesService } from "./vehicles.service";
import { FleetOwnersModule } from "../fleet-owners/fleet-owners.module";

@Module({
  imports: [FleetOwnersModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
