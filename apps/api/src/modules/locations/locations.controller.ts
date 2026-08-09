import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { LocationsService } from "./locations.service";

@ApiTags("locations")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("locations")
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get("trip/:tripId")
  @Permissions(PERMISSIONS.TRIPS_READ)
  @ApiOperation({ summary: "Ultimos puntos GPS registrados de un viaje" })
  findByTrip(@Param("tripId") tripId: string, @TenantId() tenantId: string) {
    return this.locationsService.findByTrip(tenantId, tripId);
  }
}
