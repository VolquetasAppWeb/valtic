# Roles y permisos

La autorizacion en VALTIC se basa en **permisos**, no en el nombre del rol. Cada endpoint protegido declara los permisos que acepta con el decorador `@Permissions(...)`; el `PermissionsGuard` compara esa lista contra los permisos incluidos en el access token del usuario autenticado.

## Catalogo de permisos

Definido en [`packages/types/src/permissions.ts`](../packages/types/src/permissions.ts) (`PERMISSIONS`). Ejemplos: `drivers:manage`, `trips:create`, `settlements:approve`, `qr:validate-scan`.

## Roles

| Rol | Alcance | Se aprovisiona |
|---|---|---|
| `SUPER_ADMIN` | Global (`tenantId = null`) | Una sola vez, en el seed |
| `TENANT_ADMIN` | Por tenant | Automaticamente al crear una empresa (`TenantsService.create`) |
| `DISPATCHER` | Por tenant | Automaticamente al crear una empresa |
| `FLEET_OWNER` | Por tenant | Automaticamente al crear una empresa |
| `DRIVER` | Por tenant | Automaticamente al crear una empresa (los conductores no usan `UserRole`; sus permisos son el conjunto fijo `TENANT_ROLE_DEFAULT_PERMISSIONS.DRIVER`) |

La matriz de permisos por defecto de cada rol de tenant vive en `TENANT_ROLE_DEFAULT_PERMISSIONS` (mismo archivo). `RolesService.provisionDefaultRoles(tenantId)` crea los 4 roles y sus `RolePermission` la primera vez que se crea un tenant; es idempotente (usa `upsert`).

`SUPER_ADMIN` solo tiene `tenants:manage` y `audit:read-global` — nunca permisos sobre datos de un tenant especifico. Esto se refuerza ademas con `TenantScopeGuard`, que bloquea cualquier endpoint marcado con `@UseGuards(TenantScopeGuard)` si `user.tenantId` es `null`.

## Como se emite un token

1. Login exitoso (`AuthService.adminLogin` / `driverLogin`) consulta los roles del usuario (`UserRole -> Role -> RolePermission -> Permission`) o, para conductores, usa el arreglo fijo de permisos de `DRIVER`.
2. Los permisos resultantes (deduplicados) se incluyen directamente en el payload del **access token** (`AuthenticatedUser.permissions`), junto con `tenantId` y `roles`.
3. Esto evita una consulta a base de datos en cada request protegido: `PermissionsGuard` solo lee el payload ya verificado por `JwtAuthGuard`.
4. Como contrapartida, un cambio de permisos de un rol no se refleja hasta el proximo login o rotacion de refresh token (vida util del access token: 15 minutos por defecto).

## Guards

| Guard | Que valida | Alcance |
|---|---|---|
| `JwtAuthGuard` | Que exista un access token valido en `Authorization: Bearer`. Se salta si el handler tiene `@Public()`. | Global (`APP_GUARD`) |
| `PermissionsGuard` | Que `user.permissions` incluya al menos uno de los permisos declarados en `@Permissions(...)`. Si el handler no declara permisos, deja pasar. | Global (`APP_GUARD`) |
| `TenantScopeGuard` | Que `user.tenantId` no sea `null`. | Por controlador (`@UseGuards`), en todos los modulos de datos operativos |

## Endpoints de autenticacion (`/api/v1/auth`)

| Endpoint | Publico | Descripcion |
|---|---|---|
| `POST /auth/admin/login` | Si | Email + password. Devuelve `accessToken` + perfil; setea cookie httpOnly `valtic_refresh`. |
| `POST /auth/driver/login` | Si | Documento/celular + PIN de 6 digitos. Bloqueo temporal tras `DRIVER_PIN_MAX_ATTEMPTS` intentos fallidos (`DRIVER_PIN_LOCK_MINUTES`). |
| `POST /auth/refresh` | Si (usa cookie) | Rota el refresh token (revoca el anterior, emite uno nuevo) y devuelve un access token nuevo junto al perfil del actor. |
| `POST /auth/logout` | Si (usa cookie) | Revoca el refresh token actual. |
| `POST /auth/logout-all` | No | Revoca todas las sesiones activas del usuario o conductor autenticado. |

El refresh token nunca se expone en el cuerpo de la respuesta ni se guarda en `localStorage`: viaja unicamente como cookie `httpOnly`, `sameSite=lax`, con `path` restringido a `/api/v1/auth`. El access token vive solo en memoria (store de Zustand) en el frontend; al recargar la pagina, `bootstrapSession()` llama a `/auth/refresh` para restaurar la sesion.

**Renovacion proactiva (frontend)**: ademas del refresco reactivo (disparado automaticamente cuando una request recibe `401`), `apps/web/hooks/use-session-keep-alive.ts` renueva el access token cada 8 minutos mientras la sesion siga activa, y tambien al recuperar el foco de la pestana (`visibilitychange`). Antes de esto, un usuario inactivo por mas de los 15 minutos de vida del access token podia percibir un cierre de sesion abrupto en el siguiente clic; ahora el token nunca llega a expirar mientras la pestana siga abierta.

## Multi-tenancy

Toda entidad tenant-scoped se filtra por `tenantId` en el backend (nunca solo en la UI). El `tenantId` del actor viene del payload del access token, **nunca** de un parametro de la URL o del body — por ejemplo, `UsersService.create` fuerza `tenantId = actor.tenantId` e ignora cualquier valor que llegara en el DTO.

## Alcance por propietario (dispatcher scope)

Dentro de un mismo tenant, cada `DISPATCHER` ve y gestiona **solo sus propios** conductores, vehiculos y obras — no los de otros dispatchers del mismo tenant. `TENANT_ADMIN` sigue viendo y gestionando todo el tenant sin restriccion.

- **Modelo de datos**: `Driver`, `Vehicle` y `Project` tienen un campo `dispatcherId` (nullable, FK a `User`). Se fija al crear la entidad: si el actor es un `DISPATCHER`, `dispatcherId = actor.sub`; si es `TENANT_ADMIN`, queda `null` (dato administrativo, sin dueno especifico — no aparece en el listado de ningun dispatcher).
- **Helper central**: `apps/api/src/common/dispatcher-scope.ts` expone `isDispatcherScoped(actor)`, que devuelve `true` solo si el actor tiene el rol `DISPATCHER` y **no** tiene `TENANT_ADMIN` (un actor con ambos roles se trata como admin, sin restriccion).
- **Donde se aplica**: `DriversService`, `VehiclesService`, `ProjectsService` y `OperationalSitesService` (via la obra a la que pertenece el punto operativo) filtran `create`/`findAll`/`findById`/`update`/`updateStatus` por `dispatcherId`. `DriverVehicleAssignmentsService` valida que ambos extremos de la asignacion pertenezcan al mismo dispatcher. `TripsService` valida en `create` que conductor, vehiculo y obra sean del mismo dispatcher, y filtra `findAll`/`findActive`/`findById` por `driver.dispatcherId`. `IncidentsService` filtra igual por `driver.dispatcherId`, incluyendo el endpoint de resolucion — **un dispatcher solo puede resolver novedades de sus propios conductores**; intentar resolver la de otro devuelve `404 INCIDENT_NOT_FOUND` (no `403`, para no confirmar que el recurso existe). `ReportsService.getDashboard`/`getTripsByProject` aplican el mismo filtro para que el dashboard de cada dispatcher muestre solo sus propios indicadores.
- **Como se rechaza un intento fuera de alcance**: siempre con el mismo `404 <ENTIDAD>_NOT_FOUND` que se usaria si el recurso no existiera — nunca `403 Forbidden` — para que un dispatcher no pueda diferenciar "no existe" de "existe pero no es tuyo".
- **Frontend — datos**: las paginas de listas/formularios no necesitaron cambios para el alcance por dispatcher — todas llaman a los mismos endpoints, que ya devuelven el conjunto correcto segun el actor.
- **Frontend — navegacion**: el sidebar (`apps/web/components/layout/sidebar.tsx`) si filtra que items del menu se muestran, via `hooks/use-permissions.ts` (`usePermissions().has(permissionKey)`). Un `DISPATCHER` no ve "Propietarios", "Materiales", "Tarifas", "Liquidaciones" ni "Auditoria" — catalogos/config compartidos del tenant o modulos que no gestiona, aunque tecnicamente pueda hacer `GET` de lectura en alguno de ellos (p. ej. `fleet-owners:read`, usado internamente por el dropdown de propietario al crear un vehiculo). El Dashboard y los Reportes tambien adaptan su copy y contenido: el reporte "Liquidado por propietario" (que agrega montos de **todo el tenant**, no solo del dispatcher) se oculta si el actor no tiene `settlements:manage` — reforzado tambien en el backend (`GET /reports/settlements-by-owner` ahora exige `settlements:manage`, no solo `reports:read`), para que ocultar el panel en el cliente no sea la unica proteccion.
- **Seed**: `prisma/seed.ts` asigna todo el roster de demostracion (2 conductores, 2 vehiculos, 1 obra) al `DISPATCHER` sembrado (`despachador@contratistademo.com`), para que tenga datos propios visibles desde el primer login.
