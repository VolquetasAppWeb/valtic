import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import configuration from "./config/configuration";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { HealthModule } from "./health/health.module";
import { GlobalExceptionFilter } from "./common/filters/http-exception.filter";
import { AuditModule } from "./modules/audit/audit.module";
import { MailModule } from "./modules/mail/mail.module";
import { AuthModule } from "./modules/auth/auth.module";
import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "./modules/auth/guards/permissions.guard";
import { RolesModule } from "./modules/roles/roles.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { UsersModule } from "./modules/users/users.module";
import { DriversModule } from "./modules/drivers/drivers.module";
import { FleetOwnersModule } from "./modules/fleet-owners/fleet-owners.module";
import { VehiclesModule } from "./modules/vehicles/vehicles.module";
import { DriverVehicleAssignmentsModule } from "./modules/driver-vehicle-assignments/driver-vehicle-assignments.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { OperationalSitesModule } from "./modules/operational-sites/operational-sites.module";
import { MaterialsModule } from "./modules/materials/materials.module";
import { RatesModule } from "./modules/rates/rates.module";
import { OperationsModule } from "./modules/operations/operations.module";
import { TripEventsModule } from "./modules/trip-events/trip-events.module";
import { TripsModule } from "./modules/trips/trips.module";
import { LocationsModule } from "./modules/locations/locations.module";
import { SyncModule } from "./modules/sync/sync.module";
import { QrValidationModule } from "./modules/qr-validation/qr-validation.module";
import { StorageModule } from "./common/storage/storage.module";
import { OcrModule } from "./common/ocr/ocr.module";
import { IncidentsModule } from "./modules/incidents/incidents.module";
import { SettlementsModule } from "./modules/settlements/settlements.module";
import { ReportsModule } from "./modules/reports/reports.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ["../../.env", ".env"],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    RedisModule,
    StorageModule,
    OcrModule,
    HealthModule,
    AuditModule,
    MailModule,
    AuthModule,
    RolesModule,
    TenantsModule,
    UsersModule,
    DriversModule,
    FleetOwnersModule,
    VehiclesModule,
    DriverVehicleAssignmentsModule,
    ProjectsModule,
    OperationalSitesModule,
    MaterialsModule,
    RatesModule,
    OperationsModule,
    TripEventsModule,
    TripsModule,
    LocationsModule,
    SyncModule,
    QrValidationModule,
    IncidentsModule,
    SettlementsModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
