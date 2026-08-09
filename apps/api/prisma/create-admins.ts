// Script puntual (no forma parte del seed de desarrollo): crea 10 cuentas
// TENANT_ADMIN sobre el tenant existente, sin tocar ningun otro dato.
// Uso: pnpm --filter @valtic/api create-admins
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { TENANT_ROLE_DEFAULT_PERMISSIONS } from "@valtic/types";

const prisma = new PrismaClient();

const ADMIN_COUNT = 10;
const EMAIL_DOMAIN = "gmail.com";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(16);
  let password = "";
  for (const byte of bytes) {
    password += chars[byte % chars.length];
  }
  return password;
}

async function provisionTenantAdminRole(tenantId: string) {
  const existingRole = await prisma.role.findFirst({ where: { tenantId, name: "TENANT_ADMIN" } });
  const role = existingRole ?? (await prisma.role.create({ data: { tenantId, name: "TENANT_ADMIN" } }));

  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...TENANT_ROLE_DEFAULT_PERMISSIONS.TENANT_ADMIN] } },
  });
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
  return role;
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) {
    throw new Error("No hay ningun tenant en la base de datos. Crea uno primero.");
  }

  const role = await provisionTenantAdminRole(tenant.id);
  const sharedPassword = generatePassword();
  const passwordHash = await argon2.hash(sharedPassword);

  console.warn(`Tenant: ${tenant.name} (${tenant.id})`);
  console.warn(`Password compartida para las 10 cuentas: ${sharedPassword}`);
  console.warn("--- Cuentas ---");

  for (let i = 1; i <= ADMIN_COUNT; i++) {
    const email = `admin${i}valtic@${EMAIL_DOMAIN}`;
    const existing = await prisma.user.findFirst({ where: { tenantId: tenant.id, email } });
    const user =
      existing ??
      (await prisma.user.create({
        data: {
          tenantId: tenant.id,
          firstName: "Admin",
          lastName: String(i),
          email,
          passwordHash,
          status: "ACTIVE",
        },
      }));

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    console.warn(`${email}${existing ? " (ya existia, solo se aseguro el rol)" : ""}`);
  }
}

main()
  .catch((error) => {
    console.error("Error creando admins:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
