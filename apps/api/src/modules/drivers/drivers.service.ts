import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { randomInt } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { OcrService, type CedulaExtraction, type DriverLicenseExtraction } from "../../common/ocr/ocr.service";
import { StorageService } from "../../common/storage/storage.service";
import { encryptPin, decryptPin } from "../../common/crypto/pin-cipher";
import { toPaginatedResponse } from "../../common/pagination";
import { isDispatcherScoped } from "../../common/dispatcher-scope";
import { IN_PROGRESS_STATUSES } from "../trips/domain/trip-state-machine";
import type { AppConfig } from "../../config/configuration";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import type { CreateDriverDto } from "./dto/create-driver.dto";
import type { UpdateDriverDto } from "./dto/update-driver.dto";
import type { DriverQueryDto } from "./dto/driver-query.dto";

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly ocrService: OcrService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  // Lee las fotos de la cedula (frente y reverso) y devuelve todos los
  // campos que se pudieron leer — no persiste nada, el registro automatico
  // usa esto para autocompletar y crear el conductor.
  async extractCedula(files: Express.Multer.File[]): Promise<CedulaExtraction> {
    const { extraction } = await this.ocrService.extractCedulaFromImages(files.map((f) => f.buffer));
    return extraction;
  }

  // Lee las fotos de la licencia de conduccion (frente y reverso) y
  // devuelve todos los campos que se pudieron leer, incluido el nombre y
  // numero de documento del frente (para comparar contra la cedula).
  async extractLicense(files: Express.Multer.File[]): Promise<DriverLicenseExtraction> {
    const { extraction } = await this.ocrService.extractDriverLicenseFromImages(files.map((f) => f.buffer));
    return extraction;
  }

  // Guarda una foto en el historico del conductor (nunca sobreescribe: cada
  // carga queda como una fila nueva). `kind` distingue frente/reverso de
  // cedula y licencia de subidas sueltas (OTHER, el default).
  async uploadDocument(
    tenantId: string,
    driverId: string,
    file: Express.Multer.File,
    actor: AuthenticatedUser,
    kind?: "CEDULA_FRONT" | "CEDULA_BACK" | "LICENSE_FRONT" | "LICENSE_BACK" | "OTHER",
  ) {
    await this.assertExists(tenantId, driverId, actor);

    const stored = await this.storageService.save(file, `drivers/${driverId}/documents`);

    return this.prisma.driverDocument.create({
      data: {
        tenantId,
        driverId,
        fileUrl: stored.fileUrl,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        fileSize: stored.fileSize,
        uploadedById: actor.kind === "user" ? actor.sub : null,
        ...(kind ? { kind } : {}),
      },
    });
  }

  async listDocuments(tenantId: string, driverId: string, actor: AuthenticatedUser) {
    await this.assertExists(tenantId, driverId, actor);

    return this.prisma.driverDocument.findMany({
      where: { tenantId, driverId },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async create(tenantId: string, dto: CreateDriverDto, actor: AuthenticatedUser) {
    const existingActive = await this.prisma.driver.findFirst({
      where: { tenantId, documentNumber: dto.documentNumber, deletedAt: null },
    });
    if (existingActive) {
      throw new ConflictException({ code: "DRIVER_DOCUMENT_TAKEN", message: "Ya existe un conductor con ese documento." });
    }

    // Si el documento pertenece a un conductor eliminado (p. ej. lo despidieron
    // y vuelve), se restaura esa misma fila en vez de crear una duplicada —
    // asi conserva su historial de viajes en lugar de perderlo.
    const existingDeleted = await this.prisma.driver.findFirst({
      where: { tenantId, documentNumber: dto.documentNumber, deletedAt: { not: null } },
    });

    const { licenseExpiration, licenseCategories, ...rest } = dto;
    // El PIN se genera aleatorio aca mismo. Se devuelve en texto plano en la
    // respuesta de creacion, y ademas se guarda cifrado (pinEncrypted, AES-256-GCM)
    // para poder consultarlo de nuevo despues via getPin() — a diferencia del
    // hash de argon2 (pinHash), que solo sirve para validar el login.
    const pin = this.generatePin();
    const pinHash = await argon2.hash(pin);
    const pinEncrypted = encryptPin(pin, this.configService.get("driverPin", { infer: true }).encryptionKey);
    const data = {
      ...rest,
      licenseExpiration: new Date(licenseExpiration),
      licenseCategories: licenseCategories as unknown as Prisma.InputJsonValue | undefined,
      pinHash,
      pinEncrypted,
      dispatcherId: isDispatcherScoped(actor) ? actor.sub : null,
      status: "ACTIVE" as const,
      deletedAt: null,
      deletedById: null,
      deleteReason: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    };

    const driver = existingDeleted
      ? await this.prisma.driver.update({ where: { id: existingDeleted.id }, data })
      : await this.prisma.driver.create({ data: { tenantId, ...data } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: existingDeleted ? "DRIVER_RESTORED" : "DRIVER_CREATED",
      entityType: "Driver",
      entityId: driver.id,
      newValue: { documentNumber: driver.documentNumber, firstName: driver.firstName, lastName: driver.lastName },
    });

    return { ...this.toSafeDriver(driver), pin };
  }

  private generatePin(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  async findAll(tenantId: string, query: DriverQueryDto, actor: AuthenticatedUser) {
    const where = {
      tenantId,
      deletedAt: null,
      ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" as const } },
              { lastName: { contains: query.search, mode: "insensitive" as const } },
              { documentNumber: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        orderBy: { firstName: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          assignments: { where: { active: true }, include: { vehicle: true }, take: 1 },
        },
      }),
      this.prisma.driver.count({ where }),
    ]);

    return toPaginatedResponse(
      items.map((driver) => this.toSafeDriver(driver)),
      query.page,
      query.pageSize,
      totalItems,
    );
  }

  async findById(tenantId: string, id: string, actor: AuthenticatedUser) {
    const driver = await this.prisma.driver.findFirst({
      where: { id, tenantId, deletedAt: null, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
      include: {
        assignments: { where: { active: true }, include: { vehicle: true } },
        trips: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!driver) {
      throw new NotFoundException({ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." });
    }
    return this.toSafeDriver(driver);
  }

  async update(tenantId: string, id: string, dto: UpdateDriverDto, actor: AuthenticatedUser) {
    await this.assertExists(tenantId, id, actor);

    const { licenseExpiration, licenseCategories, ...rest } = dto;
    const driver = await this.prisma.driver.update({
      where: { id },
      data: {
        ...rest,
        ...(licenseExpiration ? { licenseExpiration: new Date(licenseExpiration) } : {}),
        ...(licenseCategories ? { licenseCategories: licenseCategories as unknown as Prisma.InputJsonValue } : {}),
      },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_UPDATED",
      entityType: "Driver",
      entityId: id,
      newValue: dto,
    });

    return this.toSafeDriver(driver);
  }

  async updateStatus(tenantId: string, id: string, status: "ACTIVE" | "INACTIVE" | "SUSPENDED", actor: AuthenticatedUser) {
    const driver = await this.assertExists(tenantId, id, actor);
    const updated = await this.prisma.driver.update({ where: { id }, data: { status } });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_STATUS_CHANGED",
      entityType: "Driver",
      entityId: id,
      oldValue: { status: driver.status },
      newValue: { status: updated.status },
    });

    return this.toSafeDriver(updated);
  }

  async resetPin(tenantId: string, id: string, newPin: string, actor: AuthenticatedUser) {
    await this.assertExists(tenantId, id, actor);
    const pinHash = await argon2.hash(newPin);
    const pinEncrypted = encryptPin(newPin, this.configService.get("driverPin", { infer: true }).encryptionKey);

    const updated = await this.prisma.driver.update({
      where: { id },
      data: { pinHash, pinEncrypted, pinFailedAttempts: 0, pinLockedUntil: null },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_PIN_RESET",
      entityType: "Driver",
      entityId: id,
    });

    return this.toSafeDriver(updated);
  }

  // Descifra y devuelve el PIN actual del conductor para que el despachador
  // pueda volver a consultarlo (no solo verlo una vez al crearlo). Los
  // conductores creados antes de este campo no tienen pinEncrypted — en ese
  // caso hay que usar "Restablecer PIN" para generarles uno nuevo.
  async getPin(tenantId: string, id: string, actor: AuthenticatedUser) {
    const driver = await this.assertExists(tenantId, id, actor);
    if (!driver.pinEncrypted) {
      throw new ConflictException({
        code: "DRIVER_PIN_NOT_AVAILABLE",
        message: "Este conductor no tiene un PIN consultable. Usa 'Restablecer PIN' para generarle uno nuevo.",
      });
    }
    const pin = decryptPin(driver.pinEncrypted, this.configService.get("driverPin", { infer: true }).encryptionKey);

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_PIN_VIEWED",
      entityType: "Driver",
      entityId: id,
    });

    return { pin };
  }

  // El DISPATCHER elimina (soft-delete) solo sus propios conductores; nunca
  // se borra la fila — queda excluida de las consultas normales
  // (deletedAt: null) y visible unicamente para TENANT_ADMIN via
  // findDeleted, ademas de quedar registrada en AuditEvent con el motivo.
  async remove(tenantId: string, id: string, reason: string | undefined, actor: AuthenticatedUser) {
    const driver = await this.assertExists(tenantId, id, actor);

    const activeTrips = await this.prisma.trip.count({
      where: { driverId: id, status: { in: IN_PROGRESS_STATUSES } },
    });
    if (activeTrips > 0) {
      throw new ConflictException({
        code: "DRIVER_HAS_ACTIVE_TRIPS",
        message: "No se puede eliminar un conductor con viajes en curso.",
      });
    }

    await this.prisma.driver.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.sub, deleteReason: reason, status: "INACTIVE" },
    });

    await this.auditService.record({
      tenantId,
      actorUserId: actor.sub,
      action: "DRIVER_DELETED",
      entityType: "Driver",
      entityId: id,
      reason,
      oldValue: {
        documentNumber: driver.documentNumber,
        firstName: driver.firstName,
        lastName: driver.lastName,
        licenseNumber: driver.licenseNumber,
        status: driver.status,
      },
    });
  }

  // Historial de eliminados — solo para TENANT_ADMIN (gateado en el
  // controller via audit:read), no scopeado por dispatcher: el admin
  // necesita ver eliminaciones de todos los dispatchers del tenant.
  async findDeleted(tenantId: string, query: PaginationQueryDto) {
    const where = { tenantId, deletedAt: { not: null } };

    const [items, totalItems] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          dispatcher: { select: { id: true, firstName: true, lastName: true } },
          deletedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.driver.count({ where }),
    ]);

    return toPaginatedResponse(
      items.map((driver) => this.toSafeDriver(driver)),
      query.page,
      query.pageSize,
      totalItems,
    );
  }

  private async assertExists(tenantId: string, id: string, actor: AuthenticatedUser) {
    const driver = await this.prisma.driver.findFirst({
      where: { id, tenantId, deletedAt: null, ...(isDispatcherScoped(actor) ? { dispatcherId: actor.sub } : {}) },
    });
    if (!driver) {
      throw new NotFoundException({ code: "DRIVER_NOT_FOUND", message: "Conductor no encontrado." });
    }
    return driver;
  }

  private toSafeDriver<T extends { pinHash: string; pinEncrypted?: string | null }>(driver: T) {
    const { pinHash: _pinHash, pinEncrypted: _pinEncrypted, ...safe } = driver;
    return safe;
  }
}
