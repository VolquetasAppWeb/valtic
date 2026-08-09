import { Module } from "@nestjs/common";
import { DriverVehicleAssignmentsController } from "./driver-vehicle-assignments.controller";
import { DriverVehicleAssignmentsService } from "./driver-vehicle-assignments.service";

@Module({
  controllers: [DriverVehicleAssignmentsController],
  providers: [DriverVehicleAssignmentsService],
})
export class DriverVehicleAssignmentsModule {}
