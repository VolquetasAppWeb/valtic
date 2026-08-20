import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { CreateAssignmentDto } from "./dto/create-assignment.dto";

type DriverLicenseCategoryRow = { category?: string | null };

// Regla de negocio (no es lo que dice literalmente el "servicio" impreso en
// cada fila de la licencia, es una regla adicional): C2/C3 autorizan
// volquetas de servicio PARTICULAR y PUBLICO; B2/B3 autorizan unicamente
// PARTICULAR. Sin ninguna de las 4, el conductor no deberia poder manejar
// una volqueta (ya se bloquea al crearlo, pero se revalida aca por si el
// dato se corrigio a mano despues).
function driverVolquetaCapability(licenseCategories: unknown): "BOTH" | "PARTICULAR_ONLY" | "NONE" {
  const rows = Array.isArray(licenseCategories) ? (licenseCategories as DriverLicenseCategoryRow[]) : [];
  const codes = rows.map((row) => (row.category ?? "").toUpperCase()).join(" ");
  if (/C2|C3/.test(codes)) return "BOTH";
  if (/B2|B3/.test(codes)) return "PARTICULAR_ONLY";
  return "NONE";
}

// Normaliza el "servicio" leido de la tarjeta de propiedad del vehiculo a
// PARTICULAR/PUBLICO/null (dato desconocido — no bloquea si no se pudo leer).
function normalizeVehicleService(serviceType: string | null): "PARTICULAR" | "PUBLICO" | null {
  if (!serviceType) return null;
  const normalized = serviceType
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  if (normalized.includes("PARTIC")) return "PARTICULAR";
  if (normalized.includes("PUBLIC")) return "PUBLICO";
  return null;
}

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

    // Compatibilidad de servicio: C2/C3 habilitan particular y publico;
    // B2/B3 solo particular. Si no se pudo leer el servicio del vehiculo
    // (tarjeta de propiedad sin ese dato), no se bloquea — best-effort.
    const vehicleService = normalizeVehicleService(vehicle.serviceType);
    if (vehicleService) {
      const capability = driverVolquetaCapability(driver.licenseCategories);
      const authorized = vehicleService === "PARTICULAR" ? capability !== "NONE" : capability === "BOTH";
      if (!authorized) {
        throw new ConflictException({
          code: "DRIVER_CATEGORY_NOT_AUTHORIZED",
          message:
            vehicleService === "PUBLICO"
              ? "El conductor no tiene categoria C2 ni C3 en su licencia, necesarias para un vehiculo de servicio publico."
              : "El conductor no tiene categoria B2, B3, C2 ni C3 en su licencia, necesarias para manejar volquetas.",
        });
      }
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
