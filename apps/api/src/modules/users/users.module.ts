import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { RolesModule } from "../roles/roles.module";
import { FleetOwnersModule } from "../fleet-owners/fleet-owners.module";

@Module({
  imports: [RolesModule, FleetOwnersModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
