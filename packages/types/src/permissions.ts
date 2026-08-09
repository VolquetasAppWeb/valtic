// Catalogo central de permisos. La autorizacion en el backend se basa
// en estas claves, nunca directamente en el nombre del rol.

export const PERMISSIONS = {
  TENANTS_MANAGE: "tenants:manage",
  USERS_MANAGE: "users:manage",
  DRIVERS_MANAGE: "drivers:manage",
  DRIVERS_READ: "drivers:read",
  FLEET_OWNERS_MANAGE: "fleet-owners:manage",
  FLEET_OWNERS_READ: "fleet-owners:read",
  VEHICLES_MANAGE: "vehicles:manage",
  VEHICLES_READ: "vehicles:read",
  PROJECTS_MANAGE: "projects:manage",
  PROJECTS_READ: "projects:read",
  SITES_MANAGE: "sites:manage",
  SITES_READ: "sites:read",
  MATERIALS_MANAGE: "materials:manage",
  MATERIALS_READ: "materials:read",
  RATES_MANAGE: "rates:manage",
  RATES_READ: "rates:read",
  TRIPS_CREATE: "trips:create",
  TRIPS_ASSIGN: "trips:assign",
  TRIPS_READ: "trips:read",
  TRIPS_READ_OWN: "trips:read-own",
  TRIPS_UPDATE_OWN_PROGRESS: "trips:update-own-progress",
  TRIPS_CANCEL: "trips:cancel",
  TRIPS_MANUAL_CLOSE: "trips:manual-close",
  TRIPS_REVIEW: "trips:review",
  INCIDENTS_REPORT: "incidents:report",
  INCIDENTS_READ: "incidents:read",
  INCIDENTS_RESOLVE: "incidents:resolve",
  SETTLEMENTS_MANAGE: "settlements:manage",
  SETTLEMENTS_APPROVE: "settlements:approve",
  SETTLEMENTS_READ_OWN: "settlements:read-own",
  SETTLEMENTS_CREATE_OWN: "settlements:create-own",
  AUDIT_READ: "audit:read",
  AUDIT_READ_GLOBAL: "audit:read-global",
  REPORTS_READ: "reports:read",
  QR_GENERATE: "qr:generate",
  QR_VALIDATE_SCAN: "qr:validate-scan",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Matriz de permisos por defecto para los roles de tenant que se
// aprovisionan automaticamente al crear una empresa. SUPER_ADMIN no
// aparece aqui: es un rol global (tenantId null) creado una sola vez
// en el seed, con permisos exclusivos de plataforma (TENANTS_MANAGE).
export type TenantRoleName = "TENANT_ADMIN" | "DISPATCHER" | "FLEET_OWNER" | "DRIVER";

export const TENANT_ROLE_DEFAULT_PERMISSIONS: Record<TenantRoleName, PermissionKey[]> = {
  TENANT_ADMIN: [
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.DRIVERS_MANAGE,
    PERMISSIONS.DRIVERS_READ,
    PERMISSIONS.FLEET_OWNERS_MANAGE,
    PERMISSIONS.FLEET_OWNERS_READ,
    PERMISSIONS.VEHICLES_MANAGE,
    PERMISSIONS.VEHICLES_READ,
    PERMISSIONS.PROJECTS_MANAGE,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.SITES_MANAGE,
    PERMISSIONS.SITES_READ,
    PERMISSIONS.MATERIALS_MANAGE,
    PERMISSIONS.MATERIALS_READ,
    PERMISSIONS.RATES_MANAGE,
    PERMISSIONS.RATES_READ,
    PERMISSIONS.TRIPS_CREATE,
    PERMISSIONS.TRIPS_ASSIGN,
    PERMISSIONS.TRIPS_READ,
    PERMISSIONS.TRIPS_CANCEL,
    PERMISSIONS.TRIPS_MANUAL_CLOSE,
    PERMISSIONS.TRIPS_REVIEW,
    PERMISSIONS.INCIDENTS_REPORT,
    PERMISSIONS.INCIDENTS_READ,
    PERMISSIONS.INCIDENTS_RESOLVE,
    PERMISSIONS.SETTLEMENTS_MANAGE,
    PERMISSIONS.SETTLEMENTS_APPROVE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.QR_GENERATE,
  ],
  // El DISPATCHER gestiona (crea/edita) sus propios conductores, vehiculos y
  // obras — no los de otros dispatchers. El scope por "propietario" se
  // aplica en el backend (Driver/Vehicle/Project.dispatcherId), no aqui: el
  // permiso solo habilita la accion, no decide sobre que filas.
  DISPATCHER: [
    PERMISSIONS.DRIVERS_MANAGE,
    PERMISSIONS.DRIVERS_READ,
    PERMISSIONS.FLEET_OWNERS_READ,
    PERMISSIONS.VEHICLES_MANAGE,
    PERMISSIONS.VEHICLES_READ,
    PERMISSIONS.PROJECTS_MANAGE,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.SITES_MANAGE,
    PERMISSIONS.SITES_READ,
    PERMISSIONS.MATERIALS_READ,
    // Cada DISPATCHER fija sus propias tarifas (Rate.dispatcherId), no solo
    // las lee — mismo criterio que drivers/vehicles/projects arriba.
    PERMISSIONS.RATES_MANAGE,
    PERMISSIONS.RATES_READ,
    PERMISSIONS.TRIPS_CREATE,
    PERMISSIONS.TRIPS_ASSIGN,
    PERMISSIONS.TRIPS_READ,
    PERMISSIONS.TRIPS_CANCEL,
    PERMISSIONS.TRIPS_MANUAL_CLOSE,
    // Revisa (aprueba/rechaza) los viajes en UNDER_REVIEW de sus propios
    // conductores; el scope de filas se resuelve en el backend igual que el
    // resto de "datos propios" del dispatcher.
    PERMISSIONS.TRIPS_REVIEW,
    PERMISSIONS.INCIDENTS_REPORT,
    PERMISSIONS.INCIDENTS_READ,
    PERMISSIONS.INCIDENTS_RESOLVE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.QR_GENERATE,
    // Puede VER y GENERAR (no aprobar/cancelar/ajustar) liquidaciones, pero
    // solo de sus propios propietarios asignados; el scope de filas se
    // resuelve en el backend igual que el resto de "datos propios" del
    // dispatcher.
    PERMISSIONS.SETTLEMENTS_READ_OWN,
    PERMISSIONS.SETTLEMENTS_CREATE_OWN,
  ],
  FLEET_OWNER: [
    PERMISSIONS.VEHICLES_READ,
    PERMISSIONS.DRIVERS_READ,
    PERMISSIONS.TRIPS_READ_OWN,
    PERMISSIONS.SETTLEMENTS_READ_OWN,
  ],
  DRIVER: [
    PERMISSIONS.TRIPS_READ_OWN,
    PERMISSIONS.TRIPS_UPDATE_OWN_PROGRESS,
    PERMISSIONS.INCIDENTS_REPORT,
    PERMISSIONS.QR_VALIDATE_SCAN,
  ],
};

export const SUPER_ADMIN_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.TENANTS_MANAGE,
  PERMISSIONS.AUDIT_READ_GLOBAL,
];
