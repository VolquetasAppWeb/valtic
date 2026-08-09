import { Injectable } from "@nestjs/common";
import { PERMISSIONS, TENANT_ROLE_DEFAULT_PERMISSIONS, type TenantRoleName } from "@valtic/types";
import { PrismaService } from "../../prisma/prisma.service";

const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS);
const TENANT_ROLE_NAMES = Object.keys(TENANT_ROLE_DEFAULT_PERMISSIONS) as TenantRoleName[];

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  // Garantiza que el catalogo de permisos existe en base de datos (idempotente).
  async ensurePermissionsSeeded(): Promise<void> {
    await Promise.all(
      ALL_PERMISSION_KEYS.map((key) =>
        this.prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key },
        }),
      ),
    );
  }

  // Crea los 4 roles de tenant (TENANT_ADMIN, DISPATCHER, FLEET_OWNER, DRIVER)
  // con sus permisos por defecto. Se invoca al crear una empresa.
  async provisionDefaultRoles(tenantId: string): Promise<void> {
    await this.ensurePermissionsSeeded();

    for (const roleName of TENANT_ROLE_NAMES) {
      const role = await this.prisma.role.upsert({
        where: { tenantId_name: { tenantId, name: roleName } },
        update: {},
        create: { tenantId, name: roleName },
      });

      const permissionKeys = TENANT_ROLE_DEFAULT_PERMISSIONS[roleName];
      const permissions = await this.prisma.permission.findMany({ where: { key: { in: permissionKeys } } });

      await Promise.all(
        permissions.map((permission) =>
          this.prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
            update: {},
            create: { roleId: role.id, permissionId: permission.id },
          }),
        ),
      );
    }
  }

  async findTenantRoleByName(tenantId: string, roleName: TenantRoleName) {
    return this.prisma.role.findUnique({ where: { tenantId_name: { tenantId, name: roleName } } });
  }
}
