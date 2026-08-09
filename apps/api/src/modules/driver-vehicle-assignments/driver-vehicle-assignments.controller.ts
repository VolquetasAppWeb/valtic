import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@valtic/types";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TenantId } from "../../common/decorators/tenant-id.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TenantScopeGuard } from "../auth/guards/tenant-scope.guard";
import { DriverVehicleAssignmentsService } from "./driver-vehicle-assignments.service";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";

@ApiTags("driver-vehicle-assignments")
@ApiBearerAuth()
@UseGuards(TenantScopeGuard)
@Controller("driver-vehicle-assignments")
export class DriverVehicleAssignmentsController {
  constructor(private readonly assignmentsService: DriverVehicleAssignmentsService) {}

  @Post()
  @Permissions(PERMISSIONS.DRIVERS_MANAGE, PERMISSIONS.VEHICLES_MANAGE)
  @ApiOperation({ summary: "Asigna un conductor a un vehiculo (desactiva asignaciones previas de ambos)" })
  assign(@Body() dto: CreateAssignmentDto, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assignmentsService.assign(tenantId, dto, user);
  }

  @Get()
  @Permissions(PERMISSIONS.DRIVERS_READ, PERMISSIONS.VEHICLES_READ, PERMISSIONS.DRIVERS_MANAGE, PERMISSIONS.VEHICLES_MANAGE)
  @ApiOperation({ summary: "Lista las asignaciones activas" })
  findActive(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assignmentsService.findActive(tenantId, user);
  }

  @Patch(":id/end")
  @Permissions(PERMISSIONS.DRIVERS_MANAGE, PERMISSIONS.VEHICLES_MANAGE)
  @ApiOperation({ summary: "Termina una asignacion conductor-vehiculo" })
  end(@Param("id") id: string, @TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assignmentsService.end(tenantId, id, user);
  }
}
