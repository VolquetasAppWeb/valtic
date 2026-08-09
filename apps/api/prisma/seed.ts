import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import {
  PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
  TENANT_ROLE_DEFAULT_PERMISSIONS,
  type TenantRoleName,
} from "@valtic/types";

const prisma = new PrismaClient();

const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS);
const TENANT_ROLE_NAMES = Object.keys(TENANT_ROLE_DEFAULT_PERMISSIONS) as TenantRoleName[];

async function ensurePermissions(): Promise<void> {
  for (const key of ALL_PERMISSION_KEYS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
}

async function provisionRole(tenantId: string | null, roleName: string, permissionKeys: readonly string[]) {
  const existingRole = await prisma.role.findFirst({ where: { tenantId, name: roleName } });
  const role =
    existingRole ??
    (await prisma.role.create({ data: { tenantId, name: roleName } }));

  const permissions = await prisma.permission.findMany({ where: { key: { in: [...permissionKeys] } } });
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
  return role;
}

async function findOrCreateUser(params: {
  tenantId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}) {
  const existing = await prisma.user.findFirst({ where: { tenantId: params.tenantId, email: params.email } });
  if (existing) {
    return existing;
  }
  const passwordHash = await argon2.hash(params.password);
  return prisma.user.create({
    data: {
      tenantId: params.tenantId,
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      passwordHash,
      status: "ACTIVE",
    },
  });
}

async function assignRole(userId: string, roleId: string): Promise<void> {
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    update: {},
    create: { userId, roleId },
  });
}

async function main(): Promise<void> {
  await ensurePermissions();

  // --- SUPER_ADMIN (rol global, sin tenant) ---
  const superAdminRole = await provisionRole(null, "SUPER_ADMIN", SUPER_ADMIN_PERMISSIONS);
  const superAdmin = await findOrCreateUser({
    tenantId: null,
    email: "superadmin@valtic.dev",
    firstName: "Super",
    lastName: "Admin",
    password: "SuperAdmin123!",
  });
  await assignRole(superAdmin.id, superAdminRole.id);

  // --- Tenant demo ---
  let tenant = await prisma.tenant.findFirst({ where: { taxId: "900123456-7" } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Contratista Demo",
        legalName: "Contratista Demo S.A.S.",
        taxId: "900123456-7",
        status: "ACTIVE",
      },
    });
  }

  const rolesByName = new Map<string, string>();
  for (const roleName of TENANT_ROLE_NAMES) {
    const role = await provisionRole(tenant.id, roleName, TENANT_ROLE_DEFAULT_PERMISSIONS[roleName]);
    rolesByName.set(roleName, role.id);
  }

  const tenantAdmin = await findOrCreateUser({
    tenantId: tenant.id,
    email: "admin@contratistademo.com",
    firstName: "Ana",
    lastName: "Torres",
    password: "AdminDemo123!",
  });
  await assignRole(tenantAdmin.id, rolesByName.get("TENANT_ADMIN")!);

  const dispatcher = await findOrCreateUser({
    tenantId: tenant.id,
    email: "despachador@contratistademo.com",
    firstName: "Carlos",
    lastName: "Ramirez",
    password: "Despacho123!",
  });
  await assignRole(dispatcher.id, rolesByName.get("DISPATCHER")!);

  // --- Conductor demo (para probar login con PIN) ---
  const existingDriver = await prisma.driver.findFirst({
    where: { tenantId: tenant.id, documentNumber: "1020304050" },
  });
  if (!existingDriver) {
    const pinHash = await argon2.hash("123456");
    await prisma.driver.create({
      data: {
        tenantId: tenant.id,
        documentType: "CC",
        documentNumber: "1020304050",
        firstName: "Luis",
        lastName: "Gomez",
        phone: "3001234567",
        pinHash,
        licenseNumber: "LIC-001",
        licenseExpiration: new Date("2027-01-01"),
        status: "ACTIVE",
      },
    });
  }

  // --- Datos operativos de demostracion (propietarios, vehiculos, obra,
  // tarifa, viajes en distintos estados y una liquidacion de ejemplo) ---
  // Gate unico por el codigo de la obra: si ya existe, todo este bloque se
  // salta (idempotente) en vez de verificar entidad por entidad.
  const existingDemoProject = await prisma.project.findFirst({
    where: { tenantId: tenant.id, code: "VIA-PERIMETRAL" },
  });

  if (!existingDemoProject) {
    const fleetOwner = await prisma.fleetOwner.create({
      data: {
        tenantId: tenant.id,
        type: "LEGAL_ENTITY",
        documentNumber: "800111222-3",
        name: "Transportes El Progreso",
        phone: "3009876543",
        status: "ACTIVE",
      },
    });

    // Todo el roster operativo demo queda asignado al DISPATCHER de la
    // semilla: cada dispatcher ve/gestiona solo sus propios conductores,
    // vehiculos y obras (Driver/Vehicle/Project.dispatcherId).
    const vehicle1 = await prisma.vehicle.create({
      data: {
        tenantId: tenant.id,
        fleetOwnerId: fleetOwner.id,
        plate: "ABC123",
        vehicleType: "DUMP_TRUCK",
        brand: "Kenworth",
        model: "T800",
        year: 2020,
        capacity: 10,
        capacityUnit: "TON",
        status: "ACTIVE",
        dispatcherId: dispatcher.id,
      },
    });

    const vehicle2 = await prisma.vehicle.create({
      data: {
        tenantId: tenant.id,
        fleetOwnerId: fleetOwner.id,
        plate: "DEF456",
        vehicleType: "DUMP_TRUCK",
        brand: "International",
        model: "7600",
        year: 2019,
        capacity: 12,
        capacityUnit: "TON",
        status: "ACTIVE",
        dispatcherId: dispatcher.id,
      },
    });

    const driver2PinHash = await argon2.hash("123456");
    const driver2 = await prisma.driver.create({
      data: {
        tenantId: tenant.id,
        documentType: "CC",
        documentNumber: "1030405060",
        firstName: "Maria",
        lastName: "Perez",
        phone: "3007654321",
        pinHash: driver2PinHash,
        licenseNumber: "LIC-002",
        licenseExpiration: new Date("2027-06-01"),
        status: "ACTIVE",
        dispatcherId: dispatcher.id,
      },
    });
    const driver1 =
      existingDriver ??
      (await prisma.driver.findFirstOrThrow({ where: { tenantId: tenant.id, documentNumber: "1020304050" } }));
    if (!driver1.dispatcherId) {
      await prisma.driver.update({ where: { id: driver1.id }, data: { dispatcherId: dispatcher.id } });
    }

    const project = await prisma.project.create({
      data: {
        tenantId: tenant.id,
        name: "Via Perimetral Norte",
        code: "VIA-PERIMETRAL",
        clientName: "Municipio Demo",
        status: "ACTIVE",
        startDate: new Date("2026-01-01"),
        dispatcherId: dispatcher.id,
      },
    });

    const originSite = await prisma.operationalSite.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        name: "Cantera Norte",
        type: "LOAD",
        address: "Km 5 Via Norte",
        latitude: 4.72,
        longitude: -74.05,
        geofenceRadius: 150,
        status: "ACTIVE",
      },
    });

    const destinationSite = await prisma.operationalSite.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        name: "Obra Perimetral",
        type: "UNLOAD",
        address: "Calle 170 con Av. Boyaca",
        latitude: 4.75,
        longitude: -74.06,
        geofenceRadius: 150,
        status: "ACTIVE",
      },
    });

    const material = await prisma.material.create({
      data: { tenantId: tenant.id, name: "Recebo comun", code: "RECEBO", unit: "m3", status: "ACTIVE" },
    });

    const rate = await prisma.rate.create({
      data: {
        tenantId: tenant.id,
        projectId: project.id,
        originSiteId: originSite.id,
        destinationSiteId: destinationSite.id,
        materialId: material.id,
        rateType: "PER_TRIP",
        value: 85_000,
        currency: "COP",
        validFrom: new Date("2026-01-01"),
        status: "ACTIVE",
      },
    });

    const rateSnapshot = {
      rateId: rate.id,
      rateType: rate.rateType,
      value: rate.value.toString(),
      currency: rate.currency,
      validFrom: rate.validFrom.toISOString(),
      validUntil: null,
    };

    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const commonTripFields = {
      tenantId: tenant.id,
      projectId: project.id,
      originSiteId: originSite.id,
      destinationSiteId: destinationSite.id,
      materialId: material.id,
      rateId: rate.id,
      rateSnapshot,
      createdById: tenantAdmin.id,
    };

    let sequentialNumber = 0;
    const nextSequentialNumber = () => ++sequentialNumber;

    // Viaje activo, recien asignado.
    await prisma.trip.create({
      data: {
        ...commonTripFields,
        sequentialNumber: nextSequentialNumber(),
        driverId: driver1.id,
        vehicleId: vehicle1.id,
        fleetOwnerId: fleetOwner.id,
        status: "ASSIGNED",
        assignedAt: now,
      },
    });

    // Viaje activo, en curso (cargando).
    await prisma.trip.create({
      data: {
        ...commonTripFields,
        sequentialNumber: nextSequentialNumber(),
        driverId: driver2.id,
        vehicleId: vehicle2.id,
        fleetOwnerId: fleetOwner.id,
        status: "LOADING",
        assignedAt: now,
        acceptedAt: now,
        startedAt: now,
      },
    });

    // Viaje completado hoy, elegible para una nueva liquidacion (demo de preview/crear en /settlements).
    await prisma.trip.create({
      data: {
        ...commonTripFields,
        sequentialNumber: nextSequentialNumber(),
        driverId: driver1.id,
        vehicleId: vehicle1.id,
        fleetOwnerId: fleetOwner.id,
        status: "COMPLETED",
        assignedAt: fiveDaysAgo,
        acceptedAt: fiveDaysAgo,
        startedAt: fiveDaysAgo,
        loadedAt: fiveDaysAgo,
        completedAt: now,
      },
    });

    // Viaje cancelado.
    await prisma.trip.create({
      data: {
        ...commonTripFields,
        sequentialNumber: nextSequentialNumber(),
        driverId: driver2.id,
        vehicleId: vehicle2.id,
        fleetOwnerId: fleetOwner.id,
        status: "CANCELLED",
        assignedAt: fiveDaysAgo,
        cancelledAt: fiveDaysAgo,
        cancellationReason: "Vehiculo con falla mecanica antes de iniciar cargue.",
      },
    });

    // Viaje cerrado manualmente por el despachador.
    await prisma.trip.create({
      data: {
        ...commonTripFields,
        sequentialNumber: nextSequentialNumber(),
        driverId: driver1.id,
        vehicleId: vehicle1.id,
        fleetOwnerId: fleetOwner.id,
        status: "MANUALLY_CLOSED",
        assignedAt: fiveDaysAgo,
        acceptedAt: fiveDaysAgo,
      },
    });

    // Viaje enviado a revision y rechazado (discrepancia en cierre por QR/geocerca).
    await prisma.trip.create({
      data: {
        ...commonTripFields,
        sequentialNumber: nextSequentialNumber(),
        driverId: driver2.id,
        vehicleId: vehicle2.id,
        fleetOwnerId: fleetOwner.id,
        status: "REJECTED",
        assignedAt: fiveDaysAgo,
        acceptedAt: fiveDaysAgo,
        startedAt: fiveDaysAgo,
        loadedAt: fiveDaysAgo,
      },
    });

    // Dos viajes ya liquidados (SETTLED), agrupados en una liquidacion aprobada de ejemplo.
    const settledTrip1 = await prisma.trip.create({
      data: {
        ...commonTripFields,
        sequentialNumber: nextSequentialNumber(),
        driverId: driver1.id,
        vehicleId: vehicle1.id,
        fleetOwnerId: fleetOwner.id,
        status: "SETTLED",
        assignedAt: fiveDaysAgo,
        acceptedAt: fiveDaysAgo,
        startedAt: fiveDaysAgo,
        loadedAt: fiveDaysAgo,
        completedAt: fiveDaysAgo,
      },
    });

    const settledTrip2 = await prisma.trip.create({
      data: {
        ...commonTripFields,
        sequentialNumber: nextSequentialNumber(),
        driverId: driver2.id,
        vehicleId: vehicle2.id,
        fleetOwnerId: fleetOwner.id,
        status: "SETTLED",
        assignedAt: fiveDaysAgo,
        acceptedAt: fiveDaysAgo,
        startedAt: fiveDaysAgo,
        loadedAt: fiveDaysAgo,
        completedAt: fiveDaysAgo,
      },
    });

    const settlement = await prisma.settlement.create({
      data: {
        tenantId: tenant.id,
        sequentialNumber: 1,
        fleetOwnerId: fleetOwner.id,
        periodStart: new Date(fiveDaysAgo.getTime() - 24 * 60 * 60 * 1000),
        periodEnd: fiveDaysAgo,
        status: "APPROVED",
        subtotal: 170_000,
        adjustmentsTotal: 0,
        total: 170_000,
        currency: "COP",
        approvedById: tenantAdmin.id,
        approvedAt: new Date(fiveDaysAgo.getTime() + 60 * 60 * 1000),
      },
    });

    for (const trip of [settledTrip1, settledTrip2]) {
      await prisma.settlementItem.create({
        data: {
          settlementId: settlement.id,
          tripId: trip.id,
          rateType: "PER_TRIP",
          quantity: 1,
          unitValue: 85_000,
          total: 85_000,
          rateSnapshot,
        },
      });
    }
  }

  console.warn("Seed ejecutado correctamente.");
  console.warn("--- Credenciales de desarrollo ---");
  console.warn("SUPER_ADMIN     -> superadmin@valtic.dev / SuperAdmin123!");
  console.warn("TENANT_ADMIN    -> admin@contratistademo.com / AdminDemo123! (tenant: Contratista Demo)");
  console.warn("DISPATCHER      -> despachador@contratistademo.com / Despacho123!");
  console.warn("DRIVER (PIN)    -> documento 1020304050 / PIN 123456");
  console.warn("DRIVER 2 (PIN)  -> documento 1030405060 / PIN 123456");
  console.warn("--- Datos operativos de demostracion ---");
  console.warn("Propietario 'Transportes El Progreso' con 2 vehiculos (ABC123, DEF456)");
  console.warn("Obra 'Via Perimetral Norte' con 2 puntos operativos y 1 tarifa PER_TRIP");
  console.warn("Todo lo anterior (conductores, vehiculos, obra) asignado al DISPATCHER de la semilla");
  console.warn("8 viajes: ASSIGNED, LOADING, COMPLETED, CANCELLED, MANUALLY_CLOSED, REJECTED y 2x SETTLED");
  console.warn("1 liquidacion aprobada (#1) con los 2 viajes SETTLED");
}

main()
  .catch((error) => {
    console.error("Error ejecutando el seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
