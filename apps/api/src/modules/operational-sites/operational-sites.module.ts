import { Module } from "@nestjs/common";
import { OperationalSitesController } from "./operational-sites.controller";
import { OperationalSitesService } from "./operational-sites.service";

@Module({
  controllers: [OperationalSitesController],
  providers: [OperationalSitesService],
  exports: [OperationalSitesService],
})
export class OperationalSitesModule {}
