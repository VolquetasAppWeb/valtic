# Arquitectura

Vision general de como esta armado VALTIC de punta a punta. Para el detalle de cada dominio, ver los documentos especificos enlazados en cada seccion.

## Vision general

VALTIC es un monolito modular multi-tenant: una sola API NestJS y un solo frontend Next.js sirven a todas las empresas contratistas (`tenant`), con aislamiento de datos reforzado en el backend (nunca solo en la UI). No hay microservicios — la complejidad del dominio (viajes, liquidaciones, QR/geocercas, novedades) se organiza en modulos NestJS dentro del mismo proceso, cada uno con su propio `dto/`, `domain/` (logica de negocio pura, sin dependencias de NestJS ni Prisma) y `*.service.ts`/`*.controller.ts`.

```text
valtic/
├── apps/
│   ├── web/     # Next.js 14 (App Router) — panel admin + experiencia /driver
│   └── api/     # NestJS — monolito modular, Prisma, Swagger
├── packages/
│   ├── ui/          # utilidades de UI compartidas (cn, design tokens)
│   ├── types/       # enums y contratos compartidos front/back (incluye permisos)
│   ├── validation/  # esquemas Zod compartidos (formularios frontend + DTOs backend)
│   ├── eslint-config/
│   └── tsconfig/
├── docker/       # Dockerfiles de api y web
├── docs/         # esta carpeta
└── docker-compose.yml
```

## Backend (`apps/api`)

NestJS + TypeScript + Prisma ORM sobre PostgreSQL, Redis para sesiones/rate limiting. Cada modulo de dominio sigue el mismo patron:

```text
modules/<dominio>/
├── dto/                    # class-validator, validacion de entrada
├── domain/                 # logica de negocio pura (sin NestJS/Prisma) — testeada con Jest
├── <dominio>.service.ts    # orquestacion: Prisma + domain/ + AuditService + TripEventsService
├── <dominio>.controller.ts # rutas REST, @Permissions(...), guards
└── <dominio>.module.ts
```

La logica de negocio mas sensible vive en `domain/*.ts` como funciones puras (sin efectos secundarios, sin `PrismaService`), lo que las hace triviales de testear con Jest sin levantar base de datos:

| Archivo | Que hace |
|---|---|
| `modules/trips/domain/trip-state-machine.ts` | Unica fuente de verdad de las transiciones validas de `Trip.status` — ver `docs/trip-state-machine.md` |
| `modules/qr-validation/domain/geofence.ts` | Distancia Haversine y validacion de geocerca (radio, precision GPS, antiguedad de ubicacion) |
| `modules/qr-validation/domain/qr-token.ts` | Firma/verificacion HMAC-SHA256 de tokens QR — ver `docs/qr-validation.md` |
| `modules/settlements/domain/settlement-calculator.ts` | Calculo de liquidaciones por tipo de tarifa, siempre sobre el `rateSnapshot` congelado — ver `docs/settlements.md` |

Todas tienen suite de tests unitarios (`*.spec.ts` junto al archivo) — ver [Pruebas](#pruebas).

### Guards y decoradores transversales

Aplicados globalmente via `APP_GUARD` en `app.module.ts` (no hay que declararlos por controlador):

- **`JwtAuthGuard`**: valida el access token; rutas marcadas `@Public()` lo omiten (login, refresh, health).
- **`PermissionsGuard`** + `@Permissions(...)`: autorizacion basada en permisos (no en nombre de rol) — ver `docs/roles-and-permissions.md`.
- **`ThrottlerGuard`**: rate limiting global, reforzado por endpoint en las rutas de mayor riesgo (`@Throttle(...)` en `/auth/*` y `/qr/validate`) — ver `docs/security.md`.

Aplicados por controlador segun corresponda:

- **`TenantScopeGuard`**: bloquea cualquier actor sin `tenantId` (es decir, `SUPER_ADMIN`) de los endpoints de datos operativos. El unico controlador que lo omite a proposito es `AuditController`, porque `SUPER_ADMIN` con `audit:read-global` si necesita consultar auditoria entre tenants.
- **`@TenantId()`**: extrae el `tenantId` exclusivamente del payload del access token verificado — nunca de un parametro de URL o del body (evita IDOR entre tenants).

## Multi-tenancy

Cada empresa contratista es un `tenantId`. Todo modelo operativo (`Trip`, `Vehicle`, `FleetOwner`, `Project`, `Settlement`, etc.) tiene una columna `tenantId` y todo query del backend la incluye explicitamente en el `where` — el aislamiento se aplica en la capa de datos, no confiando en la UI. `SUPER_ADMIN` es un rol global sin `tenantId`, con acceso solo a gestion de tenants y auditoria cross-tenant, bloqueado explicitamente del resto de la API.

## Autenticacion y autorizacion

- JWT de acceso de corta duracion (15 min) + refresh token opaco rotativo en cookie `httpOnly`.
- Dos tipos de actor comparten el mismo esquema de token: `AuthenticatedUser { sub, kind: "user"|"driver", tenantId, roles, permissions }` — un usuario administrativo y un conductor se autentican distinto (email+password vs. documento+PIN) pero fluyen por el mismo guard/decorador en adelante.
- Autorizacion por permisos (`packages/types/src/permissions.ts`), no por rol — un rol es solo una coleccion de permisos por tenant.
- Bloqueo por fuerza bruta (login admin y PIN de conductor), rate limiting por endpoint, mitigacion CSRF, auditoria de acceso — ver `docs/security.md`.

Detalle completo: `docs/roles-and-permissions.md`.

## Modelo de datos (resumen)

Entidades principales y sus relaciones clave (ver `apps/api/prisma/schema.prisma` para el detalle completo de campos):

```text
Tenant 1─* User, Driver, FleetOwner, Vehicle, Project, Material, Trip, Settlement, AuditEvent
Project 1─* OperationalSite, Rate, Trip
FleetOwner 1─* Vehicle, Trip, Settlement, Rate (tarifa especifica de propietario, opcional)
Driver 1─* Trip, TripEvent, LocationPoint, Incident
Trip *─1 Project, Driver, Vehicle, FleetOwner, OperationalSite (origen y destino), Material, Rate
Trip 1─* TripEvent (append-only, hash encadenado), LocationPoint, Incident, Evidence
Settlement 1─* SettlementItem (1 por Trip liquidado, unico), SettlementAdjustment
```

Puntos de diseno relevantes:

- **`Trip.rateSnapshot`** (JSON) se congela al crear el viaje y nunca se recalcula con la tarifa vigente — las liquidaciones siempre usan este snapshot.
- **`TripEvent`** es append-only con `eventHash` encadenado (`previousHash` del evento anterior del mismo viaje) — trazabilidad tipo libro mayor sin blockchain. Ver `docs/trip-state-machine.md#cadena-de-eventos-tripevent`.
- **`AuditEvent`** es un log separado (no encadenado) de acciones administrativas (crear/editar/cambiar estado), con actor, valores antes/despues, IP y user agent.
- Los montos monetarios (`Rate.value`, `Settlement.total`, etc.) son `Decimal` en Postgres, serializados como `string` en las respuestas JSON — el frontend siempre hace `Number(...)` antes de operar con ellos.

## Frontend (`apps/web`)

Next.js 14 App Router. Dos experiencias separadas bajo el mismo proyecto:

- **Panel administrativo** (`app/(admin)/*`): protegido por `AdminAuthGuard`, sidebar fijo (`components/layout/sidebar.tsx`), una pagina por dominio (`/trips`, `/settlements`, `/audit`, etc.), cada una con su propio `useQuery`/`useMutation` inline (sin capa de hooks intermedia — convencion deliberada del proyecto para mantener cada pagina auto-contenida).
- **Experiencia de conductor** (`app/driver/*`): PWA-like, offline-first (outbox en IndexedDB, ver `docs/offline-sync.md`), optimizada para uso en campo con conectividad intermitente.

Estado y datos:

- **TanStack Query** para todo el estado de servidor (cache, refetch, invalidacion tras mutaciones) — no hay estado de servidor duplicado en Zustand.
- **Zustand** (`stores/auth-store.ts`) solo para la sesion (access token en memoria, nunca en `localStorage`, para reducir superficie XSS).
- **React Hook Form + Zod** para formularios, con los esquemas Zod compartidos con el backend via `@valtic/validation` cuando el shape coincide con un DTO.
- **`lib/api-client.ts`**: wrapper unico sobre `fetch` — adjunta el access token, reintenta una vez tras refrescar la sesion en un 401, y expone `apiClient.download(...)` para descargas autenticadas (PDF/Excel) via blob.

Mapas (`react-leaflet`) y graficas (`recharts`) se cargan con `next/dynamic({ ssr: false })` donde dependen de `window`.

## Pruebas

| Nivel | Herramienta | Que cubre |
|---|---|---|
| Unitarias (backend) | Jest (`pnpm --filter @valtic/api test`) | Los 4 archivos `domain/*.ts` listados arriba: maquina de estados de viajes, geocerca/Haversine, firma/verificacion de QR, calculo de liquidaciones |
| E2E backend | Jest + Supertest (`pnpm --filter @valtic/api test:e2e`) | Arranque real de la aplicacion Nest, health check contra Postgres/Redis reales |
| E2E frontend | Playwright (`pnpm --filter @valtic/web test:e2e`) | Flujos criticos contra los servidores de desarrollo reales (no mocks): login admin (exitoso y fallido), login de conductor (exitoso y fallido), navegacion a Liquidaciones y Auditoria con datos del seed, logout y proteccion de rutas |

Playwright corre contra `pnpm dev:api` + `pnpm dev:web` ya en ejecucion (no levanta servidores propios) para poder usar los mismos datos de seed en cada corrida — ver `apps/web/playwright.config.ts`.

## Datos de seed

`apps/api/prisma/seed.ts` (`pnpm --filter @valtic/api prisma:seed`, o automaticamente tras `prisma migrate reset`) crea, de forma idempotente:

- Catalogo completo de permisos, `SUPER_ADMIN` global, tenant demo "Contratista Demo" con sus 4 roles.
- 3 usuarios administrativos (super admin, tenant admin, despachador) y 2 conductores con PIN.
- 1 propietario de flota con 2 vehiculos, 1 obra con 2 puntos operativos y 1 tarifa `PER_TRIP`.
- 8 viajes cubriendo los estados representativos del ciclo de vida: `ASSIGNED`, `LOADING`, `COMPLETED`, `CANCELLED`, `MANUALLY_CLOSED`, `REJECTED` y 2× `SETTLED`.
- 1 liquidacion aprobada de ejemplo, con los 2 viajes `SETTLED` incluidos.

Credenciales exactas en el `README.md` (seccion "Seed de datos de desarrollo").

## Decisiones tecnicas relevantes (resumen)

Ver la seccion homonima en `README.md` para el detalle completo. Las mas estructurales:

- Monolito modular en vez de microservicios — la complejidad esta en el dominio, no en la escala; separar en servicios habria agregado costo operativo sin beneficio en este alcance.
- PostGIS no se activa en el MVP — geocercas via Haversine en aplicacion, campos `latitude`/`longitude` como `Float` compatibles con una futura migracion.
- `TripEvent` con hash encadenado por viaje (no una cadena global del sistema) — trazabilidad sin la complejidad operativa de una cadena unica.
- Monitor en vivo por polling (10-15s), sin WebSockets, para mantener el MVP simple.

## Indice de documentacion

| Documento | Contenido |
|---|---|
| `docs/roles-and-permissions.md` | Modelo de permisos, roles por tenant, matriz completa |
| `docs/trip-state-machine.md` | Transiciones de `Trip.status`, cadena de eventos, snapshot de tarifa |
| `docs/offline-sync.md` | Outbox del conductor, sincronizacion, resolucion de conflictos |
| `docs/qr-validation.md` | Firma y validacion de QR, geocercas |
| `docs/settlements.md` | Calculo de liquidaciones, ciclo de vida, limitaciones |
| `docs/reports.md` | KPIs del dashboard, reportes agregados, mapas |
| `docs/security.md` | Autenticacion, CSRF, rate limiting, auditoria |
