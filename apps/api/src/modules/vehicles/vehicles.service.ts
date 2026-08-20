import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { FleetOwnersService } from "../fleet-owners/fleet-owners.service";
import { StorageService } from "../../common/storage/storage.service";
import { OcrService, type VehicleRegistrationExtraction } from "../../common/ocr/ocr.service";
import { toPaginatedResponse } from "../../common/pagination";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import { IN_PROGRESS_STATUSES } from "../trips/domain/trip-state-machine";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import type { CreateVehicleDto } from "./dto/create-vehicle.dto";
import type { UpdateVehicleDto } from "./dto/update-vehicle.dto";
import type { VehicleQueryDto } from "./dto/vehicle-query.dto";

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly fleetOwnersService: FleetOwnersService,
    private readonly storageService: StorageService,
    private readonly ocrService: OcrService,
  ) {}

  async create(tenantId: string, dto: CreateVehicleDto, actor: AuthenticatedUser) {
    let fleetOwnerId = dto.fleetOwnerId;
    if (!fleetOwnerId) {
      if (!isDispatcherScoped(actor)) {
        throw new BadRequestException({ code: "FLEET_OWNER_REQUIRED", message: "Selecciona un propietario." });
      }
      // El dispatcher no eligio propietario: se usa (o se crea) su propio
      // perfil de propietario automaticamente.
      const selfOwner = await this.fleetOwnersService.ensureSelfFleetOwner(tenantId, actor.sub);
      fleetOwnerId = selfOwner.id;
    } else {
      await this.assertFleetOwnerBelongsToTenant(tenantId, fleetOwnerId, actor);
    }

    const normalizedPlate = dto.plate.toUpperCase();
    // Misma placa/licencia se scopea por dispatcher (ver @@unique en el
    // schema): cada DISPATCHER puede registrar su propia copia del mismo
    // vehiculo real sin chocar con otro, ni ver la del otro. Para
    // TENANT_ADMIN (dispatcherId null) esto revalida a mano, ya que Postgres
    // no trata dos NULL como iguales en el unique constraint.
    const scopeDispatcherId = isDispatcherScoped(actor) ? actor.sub : null;

    const existingActive = await this.prisma.vehicle.findFirst({
      where: { tenantId, dispatcherId: scopeDispatcherId, plate: normalizedPlate, deletedAt: null },
    });
    if (existingActive) {
      const hint =
        existingActive.status === "INACTIVE"
          ? " Hay un vehiculo con esa placa marcado como inactivo — reactivalo en vez de crear uno nuevo, o eliminalo primero si ya no existe."
          : "";
      throw new ConflictException({
        code: "VEHICLE_PLATE_TAKEN",
        message: `Ya existe un vehiculo con esa placa.${hint}`,
      });
    }

    if (dto.licenseNumber) {
      const existingLicense = await this.prisma.vehicle.findFirst({
        where: { tenantId, dispatcherId: scopeDispatcherId, licenseNumber: dto.licenseNumber, deletedAt: null },
      });
      if (existingLicense) {
        throw new ConflictException({
          code: "VEHICLE_LICENSE_NUMBER_TAKEN",
          message: "Ya existe un vehiculo con ese numero de licencia de transito.",
        });
      }
    }

    // Si la placa pertenece a un vehiculo eliminado (de este mismo
    // dispatcher/admin), se restaura esa misma fila en vez de crear una
    // duplicada — asi conserva su historial de viajes en lugar de perderlo.
    const existingDeleted = await this.prisma.vehicle.findFirst({
      where: { tenantId, dispatcherId: scopeDispatcherId, plate: normalizedPlate, deletedAt: { not: null } },
    });

    const data = {
      ...dto,
      fleetOwnerId,
      plate: dto.plate.toUpperCase(),
      dispatcherId: scopeDispatcherId,
      status: "ACTIVE" as const,
      deletedAt: null,
      deletedById: null,
      deleteReason: null,
    };

    const vehicle = existingDeleted
      ? await this.prisma.vehicle.update({ where: { id: existingDeleted.id }, data })
      : await this.prisma.vehicle.create({ data: { tenantId, ...data } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: existingDeleted ? "VEHICLE_RESTORED" : "VEHICLE_CREATED",
      entityType: "Vehicle",
      entityId: vehicle.id,
      newValue: { plate: vehicle.plate },
    });

    return vehicle;
  }

  async findAll(tenantId: string, query: VehicleQueryDto, actor: AuthenticatedUser) {
    const where = {
      tenantId,
      deletedAt: null,
      ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { plate: { contains: query.search, mode: "insensitive" as const } },
              { brand: { contains: query.search, mode: "insensitive" as const } },
              { model: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { plate: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          fleetOwner: { select: { id: true, name: true } },
          assignments: { where: { active: true }, include: { driver: true }, take: 1 },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return toPaginatedResponse(items, query.page, query.pageSize, totalItems);
  }

  async findById(tenantId: string, id: string, actor: AuthenticatedUser) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
      include: {
        fleetOwner: { select: { id: true, name: true } },
        assignments: { where: { active: true }, include: { driver: true } },
        trips: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!vehicle) {
      throw new NotFoundException({ code: "VEHICLE_NOT_FOUND", message: "Vehiculo no encontrado." });
    }
    return vehicle;
  }

  async update(tenantId: string, id: string, dto: UpdateVehicleDto, actor: AuthenticatedUser) {
    await this.assertExists(tenantId, id, actor);
    if (dto.fleetOwnerId) {
      await this.assertFleetOwnerBelongsToTenant(tenantId, dto.fleetOwnerId, actor);
    }

    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: { ...dto, ...(dto.plate ? { plate: dto.plate.toUpperCase() } : {}) },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "VEHICLE_UPDATED",
      entityType: "Vehicle",
      entityId: id,
      newValue: dto,
    });

    return updated;
  }

  async updateStatus(tenantId: string, id: string, status: "ACTIVE" | "MAINTENANCE" | "INACTIVE", actor: AuthenticatedUser) {
    const vehicle = await this.assertExists(tenantId, id, actor);
    const updated = await this.prisma.vehicle.update({ where: { id }, data: { status } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "VEHICLE_STATUS_CHANGED",
      entityType: "Vehicle",
      entityId: id,
      oldValue: { status: vehicle.status },
      newValue: { status: updated.status },
    });

    return updated;
  }

  // El DISPATCHER elimina (soft-delete) solo sus propios vehiculos; nunca
  // se borra la fila — queda excluida de las consultas normales
  // (deletedAt: null) y visible unicamente para TENANT_ADMIN via
  // findDeleted, ademas de quedar registrada en AuditEvent con el motivo.
  async remove(tenantId: string, id: string, reason: string | undefined, actor: AuthenticatedUser) {
    const vehicle = await this.assertExists(tenantId, id, actor);

    const activeTrips = await this.prisma.trip.count({
      where: { vehicleId: id, status: { in: IN_PROGRESS_STATUSES } },
    });
    if (activeTrips > 0) {
      throw new ConflictException({
        code: "VEHICLE_HAS_ACTIVE_TRIPS",
        message: "No se puede eliminar un vehiculo con viajes en curso.",
      });
    }

    await this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.sub, deleteReason: reason, status: "INACTIVE" },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "VEHICLE_DELETED",
      entityType: "Vehicle",
      entityId: id,
      reason,
      oldValue: { plate: vehicle.plate, brand: vehicle.brand, model: vehicle.model, status: vehicle.status },
    });
  }

  // Historial de eliminados — solo para TENANT_ADMIN (gateado en el
  // controller via audit:read), no scopeado por dispatcher: el admin
  // necesita ver eliminaciones de todos los dispatchers del tenant.
  async findDeleted(tenantId: string, query: PaginationQueryDto) {
    const where = { tenantId, deletedAt: { not: null } };

    const [items, totalItems] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          fleetOwner: { select: { id: true, name: true } },
          dispatcher: { select: { id: true, firstName: true, lastName: true } },
          deletedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return toPaginatedResponse(items, query.page, query.pageSize, totalItems);
  }

  // Lee las fotos de tarjeta de propiedad (frente y, si se sube, reverso) y
  // devuelve los campos que pudo identificar (placa, marca, linea,
  // modelo/año, numero de licencia de transito), sin persistir nada — el
  // registro automatico usa esto para autocompletar y crear el vehiculo.
  async extractRegistration(files: Express.Multer.File[]): Promise<VehicleRegistrationExtraction> {
    const { extraction } = await this.ocrService.extractVehicleRegistrationFromImages(files.map((f) => f.buffer));
    return extraction;
  }

  // Guarda una foto en el historico del vehiculo (nunca sobreescribe: cada
  // carga queda como una fila nueva). `kind` distingue frente/reverso de la
  // tarjeta de propiedad y foto de la volqueta de subidas sueltas (OTHER,
  // el default) para poder agruparlas en la vista de detalle.
  async uploadDocument(
    tenantId: string,
    vehicleId: string,
    file: Express.Multer.File,
    actor: AuthenticatedUser,
    kind?: "REGISTRATION_FRONT" | "REGISTRATION_BACK" | "VEHICLE_PHOTO" | "OTHER",
  ) {
    await this.assertExists(tenantId, vehicleId, actor);

    const stored = await this.storageService.save(file, `vehicles/${vehicleId}/documents`);

    return this.prisma.vehicleDocument.create({
      data: {
        tenantId,
        vehicleId,
        fileUrl: stored.fileUrl,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        fileSize: stored.fileSize,
        uploadedById: actor.kind === "user" ? actor.sub : null,
        ...(kind ? { kind } : {}),
      },
    });
  }

  async listDocuments(tenantId: string, vehicleId: string, actor: AuthenticatedUser) {
    await this.assertExists(tenantId, vehicleId, actor);

    return this.prisma.vehicleDocument.findMany({
      where: { tenantId, vehicleId },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  private async assertExists(tenantId: string, id: string, actor: AuthenticatedUser) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
    });
    if (!vehicle) {
      throw new NotFoundException({ code: "VEHICLE_NOT_FOUND", message: "Vehiculo no encontrado." });
    }
    return vehicle;
  }

  private async assertFleetOwnerBelongsToTenant(tenantId: string, fleetOwnerId: string, actor: AuthenticatedUser) {
    const fleetOwner = await this.prisma.fleetOwner.findFirst({
      where: { id: fleetOwnerId, tenantId, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
    });
    if (!fleetOwner) {
      throw new NotFoundException({ code: "FLEET_OWNER_NOT_FOUND", message: "Propietario no encontrado." });
    }
  }
}
