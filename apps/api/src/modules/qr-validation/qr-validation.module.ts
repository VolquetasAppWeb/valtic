import { Module } from "@nestjs/common";
import { QrValidationController } from "./qr-validation.controller";
import { QrValidationService } from "./qr-validation.service";
import { TripsModule } from "../trips/trips.module";

@Module({
  imports: [TripsModule],
  controllers: [QrValidationController],
  providers: [QrValidationService],
})
export class QrValidationModule {}
