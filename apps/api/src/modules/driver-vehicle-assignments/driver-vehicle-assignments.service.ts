import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { CreateAssignmentDto } from "./dto/create-assignment.dto";

@Injectable()
export class DriverVehicleAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async assign(tenantId: string, dto: CreateAssignmentDto, actor: AuthenticatedUser) {
    const [driver, vehicle] = await Promise.all([
      this.prisma.driver.findFirst({ where: { id: dto.driverId, tenantId } }),
      this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, tenantId } }),
    ]);

    if (!driver) {
      throw new NotFoundException({ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." });
    }
    if (!vehicle) {
      throw new NotFoundException({ code: "VEHICLE_NOT_FOUND", message: "Vehiculo no encontrado." });
    }
    if (isDispatcherScoped(actor) && (driver.dispatcherId !== actor.sub || vehicle.dispatcherId !== actor.sub)) {
      throw new NotFoundException({ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." });
    }
    if (driver.status !== "ACTIVE") {
      throw new ConflictException({ code: "DRIVER_NOT_ACTIVE", message: "El conductor no esta activo." });
    }
    if (vehicle.status !== "ACTIVE") {
      throw new ConflictException({ code: "VEHICLE_NOT_ACTIVE", message: "El vehiculo no esta activo." });
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.driverVehicleAssignment.updateMany({
        where: { tenantId, driverId: dto.driverId, active: true },
        data: { active: false, endAt: now },
      });
      await tx.driverVehicleAssignment.updateMany({
        where: { tenantId, vehicleId: dto.vehicleId, active: true },
        data: { active: false, endAt: now },
      });

      return tx.driverVehicleAssignment.create({
        data: { tenantId, driverId: dto.driverId, vehicleId: dto.vehicleId, startAt: now, active: true },
        include: { driver: true, vehicle: true },
      });
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_VEHICLE_ASSIGNED",
      entityType: "DriverVehicleAssignment",
      entityId: assignment.id,
      newValue: { driverId: dto.driverId, vehicleId: dto.vehicleId },
    });

    return assignment;
  }

  async findActive(tenantId: string, actor: AuthenticatedUser) {
    return this.prisma.driverVehicleAssignment.findMany({
      where: {
        tenantId,
        active: true,
        ...(isDispatcherScoped(actor) ? { driver: { dispatcherId: actor.sub } } : {}),
      },
      include: { driver: true, vehicle: true },
      orderBy: { startAt: "desc" },
    });
  }

  async end(tenantId: string, id: string, actor: AuthenticatedUser) {
    const assignment = await this.prisma.driverVehicleAssignment.findFirst({ where: { id, tenantId } });
    if (!assignment) {
      throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Asignacion no encontrada." });
    }

    const updated = await this.prisma.driverVehicleAssignment.update({
      where: { id },
      data: { active: false, endAt: new Date() },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_VEHICLE_UNASSIGNED",
      entityType: "DriverVehicleAssignment",
      entityId: id,
    });

    return updated;
  }
}
