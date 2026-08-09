import { Module } from "@nestjs/common";
import { FleetOwnersController } from "./fleet-owners.controller";
import { FleetOwnersService } from "./fleet-owners.service";

@Module({
  controllers: [FleetOwnersController],
  providers: [FleetOwnersService],
  exports: [FleetOwnersService],
})
export class FleetOwnersModule {}
