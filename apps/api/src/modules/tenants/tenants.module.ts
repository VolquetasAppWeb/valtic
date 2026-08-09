import { Module } from "@nestjs/common";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";
import { RolesModule } from "../roles/roles.module";

@Module({
  imports: [RolesModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
