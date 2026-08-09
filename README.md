# VALTIC

Plataforma digital para reemplazar el uso de vales fisicos en papel en operaciones logisticas con flotas de volquetas. Digitaliza el ciclo completo: asignacion de viajes, trazabilidad GPS, validacion de cierre por QR y geocerca, novedades y liquidaciones a propietarios de flota.

> **Estado del proyecto:** Fase 12 completada — **MVP completo (12/12 fases)**. Suite de tests unitarios (Jest) sobre toda la logica de negocio pura (maquina de estados de viajes, geocercas, firma de QR, calculo de liquidaciones), suite E2E (Playwright) sobre los flujos criticos del panel admin y la app de conductor corriendo contra los servidores reales, seed de desarrollo completo (propietario, vehiculos, obra, tarifa, 8 viajes en distintos estados y una liquidacion aprobada de ejemplo) y documentacion de arquitectura consolidada en `docs/architecture.md`. Ver [Ejecutar pruebas](#ejecutar-pruebas). Ademas de auditoria y seguridad (Fase 11, `docs/security.md`), dashboard y reportes (Fase 10, `docs/reports.md`), liquidaciones (Fase 9, `docs/settlements.md`), novedades (Fase 8), QR/geocercas (Fase 7, `docs/qr-validation.md`), experiencia offline del conductor (Fase 6, `docs/offline-sync.md`), datos maestros (Fase 4), autenticacion/multi-tenancy (Fase 3) y gestion de viajes (Fase 5, `docs/trip-state-machine.md`).

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + componentes estilo shadcn/ui + TanStack Query/Table + React Hook Form + Zod + Zustand + Leaflet.
- **Backend:** NestJS (monolito modular) + TypeScript + REST + Swagger + class-validator + JWT + Argon2 + BullMQ (fases posteriores).
- **Base de datos:** PostgreSQL + Prisma ORM + Redis (sesiones, rate limiting, colas).
- **Infra local:** Docker + Docker Compose + pnpm workspaces.
- **Pruebas:** Jest (unitarias e2e-spec del backend) + Playwright (E2E del frontend).

## Requisitos

- Node.js >= 20
- pnpm >= 9 (`corepack enable` lo habilita automaticamente)
- Docker + Docker Compose (para Postgres/Redis, o para levantar todo el stack)

## Instalacion

```bash
git clone <repo>
cd valtic
cp .env.example .env
pnpm install
```

Revisa y ajusta `.env` en la raiz. Ver la seccion [Variables de entorno](#variables-de-entorno).

## Levantar Postgres y Redis con Docker

```bash
pnpm docker:up
```

Esto levanta `postgres` (puerto **5433** en el host, para no chocar con una instalacion nativa de Postgres que pueda existir en el puerto 5432 por defecto) y `redis` (puerto 6379) usando `docker-compose.yml`. Los servicios `api` y `web` tambien estan definidos en el compose para despliegue tipo contenedor completo, pero en desarrollo local se recomienda correrlos directamente con pnpm (hot-reload mas rapido).

> Si el puerto 5433 tambien estuviera ocupado en tu maquina, cambia `POSTGRES_PORT` y `DATABASE_URL` en `.env`.

> **Prisma CLI**: los comandos `prisma migrate` / `prisma studio` / el seed se ejecutan con el cwd en `apps/api`, y el CLI de Prisma solo carga variables de entorno desde un `.env` ubicado en esa misma carpeta (no desde la raiz del monorepo). Crea `apps/api/.env` con al menos `DATABASE_URL` apuntando al mismo valor que el `.env` raiz:
>
> ```bash
> echo "DATABASE_URL=postgresql://valtic:valtic_dev_password@localhost:5433/valtic?schema=public" > apps/api/.env
> ```

## Migraciones y generacion de cliente Prisma

```bash
pnpm --filter @valtic/api prisma:generate
pnpm --filter @valtic/api prisma:migrate -- --name init
```

## Seed de datos de desarrollo

```bash
pnpm --filter @valtic/api prisma:seed
```

El seed crea el catalogo de permisos, un tenant demo con sus 4 roles aprovisionados, y las siguientes credenciales de desarrollo:

| Actor | Credenciales | Rol |
|---|---|---|
| SUPER_ADMIN | `superadmin@valtic.dev` / `SuperAdmin123!` | Global, gestiona tenants |
| TENANT_ADMIN | `admin@contratistademo.com` / `AdminDemo123!` | Empresa "Contratista Demo" |
| DISPATCHER | `despachador@contratistademo.com` / `Despacho123!` | Empresa "Contratista Demo" |
| DRIVER | Documento `1020304050` / PIN `123456` | Empresa "Contratista Demo" |
| DRIVER 2 | Documento `1030405060` / PIN `123456` | Empresa "Contratista Demo" |

Ademas, el seed crea datos operativos completos para poder navegar el panel sin tener que crear nada a mano: 1 propietario de flota ("Transportes El Progreso") con 2 vehiculos, 1 obra ("Via Perimetral Norte") con 2 puntos operativos y 1 tarifa `PER_TRIP`, 8 viajes cubriendo los estados representativos del ciclo de vida (`ASSIGNED`, `LOADING`, `COMPLETED`, `CANCELLED`, `MANUALLY_CLOSED`, `REJECTED` y 2× `SETTLED`), y 1 liquidacion aprobada de ejemplo con los 2 viajes `SETTLED` incluidos. Todo ese roster (conductores, vehiculos, obra) queda asignado como propio del `DISPATCHER` sembrado — ver "Alcance por propietario" en `docs/roles-and-permissions.md`. El seed es idempotente: si la obra "Via Perimetral Norte" ya existe para el tenant, este bloque se omite en corridas posteriores.

> Para regenerar el seed desde cero (borra todos los datos): `pnpm --filter @valtic/api prisma migrate reset --force` (aplica las migraciones y corre el seed automaticamente).

## Ejecutar el backend (NestJS)

```bash
pnpm dev:api
```

- API: `http://localhost:3001/api/v1`
- Swagger: `http://localhost:3001/docs`
- Health check: `http://localhost:3001/api/v1/health` (verifica conexion real a Postgres y Redis)

## Ejecutar el frontend (Next.js)

```bash
pnpm dev:web
```

- Panel administrativo: `http://localhost:3000` (redirige a `/login`)
- Experiencia de conductor: `http://localhost:3000/driver` (login en `/driver/login`)

> **Nota (Windows):** el script `dev` de `apps/api` usa `ts-node-dev` en lugar de `nest start --watch`. En este entorno, `nest start --watch` fallaba de forma intermitente al lanzar `dist/main.js` (conflicto entre el watcher incremental de `tsc` y el proceso que ejecuta el build) — `ts-node-dev` evita el problema y sigue soportando hot-reload.

## Ejecutar pruebas

```bash
# Backend - unitarias (logica de dominio: maquina de estados, geocercas, QR, liquidaciones)
pnpm --filter @valtic/api test

# Backend - e2e (requiere Postgres y Redis activos, pnpm docker:up)
pnpm --filter @valtic/api test:e2e

# Frontend - E2E con Playwright (requiere pnpm dev:api y pnpm dev:web corriendo,
# y el seed aplicado — los tests usan las credenciales del seed)
pnpm --filter @valtic/web test:e2e
```

Las pruebas unitarias del backend cubren los 4 archivos `domain/*.ts` (logica pura, sin NestJS ni Prisma): `trip-state-machine.ts`, `geofence.ts`, `qr-token.ts` y `settlement-calculator.ts` — 42 tests. Las pruebas E2E de Playwright cubren los flujos criticos: login de administrador (exitoso y con credenciales invalidas), login de conductor (exitoso y con PIN incorrecto), navegacion a Liquidaciones y Auditoria verificando datos reales del seed, logout con proteccion de rutas, el menu/paginas diferenciadas por rol (`TENANT_ADMIN` ve todo, `DISPATCHER` solo lo suyo), y el menu movil (el sidebar fijo se oculta y el drawer permite navegar en un viewport de 375px) — 13 tests, corriendo contra los servidores de desarrollo reales (no mocks). Los tests que solo necesitan una sesion autenticada (sin probar el login en si) comparten una unica sesion por rol via `test.describe.serial`, o cambian el viewport en vivo dentro de la misma sesion — evita agotar el rate limit de `/auth/admin/login` (5 intentos/60s) al no repetir el login real en cada asercion.

No hay tests de componentes de React ni cobertura de servicios/controladores del backend con mocks de Prisma — la estrategia de este MVP prioriza tests unitarios sobre la logica de negocio pura (donde un bug es mas costoso y menos obvio) y E2E sobre los flujos completos (donde se verifica la integracion real), dejando la capa intermedia de servicios verificada mediante las pruebas manuales end-to-end documentadas en cada fase.

## Despliegue en Railway (hosting gratuito)

El proyecto se despliega como 4 servicios dentro de un mismo proyecto de Railway: `postgres` y `redis` (plugins administrados de Railway) y `api`/`web` (build por Dockerfile, `docker/api.prod.Dockerfile` y `docker/web.prod.Dockerfile` — distintos de los `docker/*.Dockerfile` originales, que son solo para desarrollo local con `docker compose`).

1. **Crear el proyecto** en [railway.app](https://railway.app) (login con GitHub) y conectar este repositorio.
2. **Anadir Postgres**: "New" -> "Database" -> "Add PostgreSQL". Railway crea la variable `DATABASE_URL` automaticamente en ese plugin.
3. **Anadir Redis**: "New" -> "Database" -> "Add Redis". Railway crea `REDIS_URL` automaticamente en ese plugin.
4. **Servicio `api`**: "New" -> "GitHub Repo" -> este repo.
   - Settings -> Build: builder "Dockerfile", ruta `docker/api.prod.Dockerfile`, root directory `/` (el Dockerfile ya asume contexto en la raiz del monorepo).
   - Settings -> Networking: generar dominio publico (`api-xxxx.up.railway.app`).
   - Settings -> Health Check Path: `/api/v1/health`.
   - Variables (usar "Reference variable" hacia los plugins/servicios, no valores fijos):
     ```
     NODE_ENV=production
     DATABASE_URL=${{Postgres.DATABASE_URL}}
     REDIS_URL=${{Redis.REDIS_URL}}
     CORS_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
     WEB_APP_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
     JWT_ACCESS_SECRET=<valor aleatorio, ej. openssl rand -hex 32>
     JWT_REFRESH_SECRET=<valor aleatorio, distinto del anterior>
     QR_SIGNING_SECRET=<valor aleatorio, distinto de los anteriores>
     ```
     El resto de variables (`API_PREFIX`, `DRIVER_PIN_*`, `ADMIN_LOGIN_*`, `QR_EXPIRATION_SECONDS`, `GEOFENCE_*`, `STORAGE_*`, `PASSWORD_RESET_*`, `SMTP_*`/`MAIL_FROM` si se quiere envio real de correo) son opcionales — sin ellas se usan los defaults de `configuration.ts`. `PORT` lo asigna Railway solo, no se declara.
   - Settings -> Volumes: montar un volumen en `/app/apps/api/uploads` (para que las fotos/evidencias subidas sobrevivan a los redeploys; sin volumen, el disco es efimero).
5. **Servicio `web`**: "New" -> "GitHub Repo" -> mismo repo (segundo servicio).
   - Settings -> Build: builder "Dockerfile", ruta `docker/web.prod.Dockerfile`, root directory `/`.
   - Settings -> Networking: generar dominio publico (`web-xxxx.up.railway.app`).
   - Variables:
     ```
     NEXT_PUBLIC_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}/api/v1
     ```
     Esta variable se hornea en el bundle en build time (Next.js), por eso el Dockerfile la declara como `ARG` — Railway inyecta automaticamente como build arg cualquier variable del servicio cuyo nombre coincida con un `ARG` declarado.
6. **Orden de despliegue**: desplegar primero `api` (para que exista `api.RAILWAY_PUBLIC_DOMAIN`) y luego `web`. Si `web` se construye antes de que `api` tenga dominio, redesplegar `web` una vez creado.
7. **Migraciones y seed**: el `CMD` de `docker/api.prod.Dockerfile` corre `prisma migrate deploy` en cada arranque, asi que las migraciones quedan aplicadas automaticamente. El seed de datos demo (usuarios, viajes de ejemplo) es manual — desde la pestana "Shell" del servicio `api` en Railway (o `railway run` local apuntando al proyecto):
   ```bash
   pnpm prisma:seed
   ```
   Credenciales que deja el seed: ver la salida del comando o `apps/api/prisma/seed.ts`.

**Limitaciones del plan gratuito de Railway**: es un trial de uso (~$5 de credito), no "gratis para siempre" — pasado ese credito los servicios se detienen hasta agregar un metodo de pago. Para una demo funcionando 100% es suficiente.

## Variables de entorno

Ver `.env.example` para el listado completo. Grupos principales:

| Grupo | Proposito |
|---|---|
| `POSTGRES_*` / `DATABASE_URL` | Conexion a PostgreSQL |
| `REDIS_*` | Conexion a Redis |
| `API_*`, `CORS_ORIGIN` | Configuracion del servidor NestJS |
| `JWT_*` | Secretos y expiracion de access/refresh tokens |
| `DRIVER_PIN_*` | Politica de intentos y bloqueo del PIN de conductor |
| `ADMIN_LOGIN_*` | Politica de intentos y bloqueo del login de administradores |
| `QR_*` | Firma y expiracion de codigos QR de checkpoint |
| `GEOFENCE_*` | Umbrales de precision GPS y antiguedad de ubicacion para validar geocercas |
| `STORAGE_*` | Almacenamiento local de archivos (evidencias, logos) |
| `NEXT_PUBLIC_API_URL` | URL base de la API consumida por el frontend |

## Arquitectura

Monolito modular multi-tenant. Cada empresa contratista es un `tenantId`; todo filtrado por tenant se aplica en el backend (no solo en la UI). Detalle completo en [`docs/architecture.md`](docs/architecture.md).

Estructura del monorepo:

```text
valtic/
├── apps/
│   ├── web/     # Next.js — panel admin + experiencia /driver
│   └── api/     # NestJS — monolito modular, Prisma, Swagger
├── packages/
│   ├── ui/          # utilidades de UI compartidas (cn, design tokens)
│   ├── types/       # enums y contratos compartidos front/back
│   ├── validation/  # esquemas Zod compartidos
│   ├── eslint-config/
│   └── tsconfig/
├── docker/       # Dockerfiles de api y web
├── docs/         # documentacion tecnica por dominio
└── docker-compose.yml
```

## Decisiones tecnicas relevantes

- **PostGIS no se activa en el MVP**: las validaciones de geocerca usan la formula de Haversine en aplicacion; los campos `latitude`/`longitude` son `Float`, compatibles con una futura migracion a tipos geoespaciales sin romper el modelo.
- **Autorizacion basada en permisos**, no en nombre de rol: los roles agrupan `permission keys` (`packages/types/src/permissions.ts`), reforzado en el backend con `JwtAuthGuard` + `PermissionsGuard` + `TenantScopeGuard`. Detalle en [`docs/roles-and-permissions.md`](docs/roles-and-permissions.md).
- **Refresh token opaco en cookie httpOnly**, access token en memoria en el frontend (no en `localStorage`) para reducir superficie de ataque XSS; el PIN de conductor usa Argon2 igual que la contrasena de administradores.
- **Prefijo de API fijo `/api/v1`** sin versionado adicional de NestJS para evitar prefijos duplicados.
- **Monitor en vivo por polling** (10-15s), sin WebSockets, para mantener el MVP simple.
- **Hash encadenado por viaje** (no una cadena global) para trazabilidad de `TripEvent` sin la complejidad operativa de una cadena unica del sistema.

## Limitaciones del MVP (estado final — Fase 12)

- No hay pantallas de gestion de usuarios/tenants en el frontend todavia (los endpoints existen y estan probados via API; se agregan cuando haya necesidad operativa concreta).
- Un usuario administrativo se identifica solo por email (sin selector de empresa en el login); dos tenants con el mismo email de administrador colisionarian. Asuncion documentada — ver `docs/roles-and-permissions.md`.
- Las tarifas no tienen edicion posterior a su creacion (por diseno: se versionan por vigencia). Solo se puede cambiar su estado (activa/expirada/inactiva).
- Las asignaciones conductor-vehiculo solo se gestionan desde la pantalla de Vehiculos (boton "Asignar conductor"); no hay una pantalla dedicada de historial de asignaciones todavia.
- El QR no se renderiza como imagen escaneable por camara: el panel muestra el token como texto para copiar, y el conductor lo pega manualmente — autorizado explicitamente por el alcance para el MVP web (ver `docs/qr-validation.md`).
- Reportar una novedad (admin o conductor) requiere conexion a internet — no pasa por el outbox offline de la Fase 6, igual que el escaneo de QR: ambas necesitan confirmacion inmediata del servidor.
- Los archivos de evidencia se sirven como estaticos publicos sin URL firmada (limitacion documentada en `docs/security.md`).
- El numero secuencial del viaje se calcula con `MAX + 1` dentro de una transaccion; bajo alta concurrencia de creacion simultanea podria colisionar. Aceptable para el volumen esperado del MVP.
- **`PER_KILOMETER` en liquidaciones es una aproximacion**: no hay integracion con un motor de ruteo real; se usa distancia Haversine (linea recta) entre origen y destino, no la distancia real recorrida. Ver `docs/settlements.md`.
- **`actualQuantity` casi nunca esta disponible** para el calculo de liquidaciones `PER_TON`/`PER_CUBIC_METER`: no existe integracion con bascula/pesaje, asi que se usa `estimatedQuantity` como fallback en la gran mayoria de los casos.
- El estado `PAID` de liquidacion esta modelado pero sin endpoint de transicion todavia — falta el flujo de conciliacion de pagos.
- El numero secuencial de liquidacion usa el mismo patron `MAX + 1` que el de viajes, con la misma limitacion de concurrencia documentada arriba.
- **"Conductores disponibles" en el dashboard es una aproximacion**: cuenta conductores activos sin viaje en curso, no un estado de disponibilidad explicito (vacaciones/descanso no se modelan). Ver `docs/reports.md`.
- El KPI "Valor liquidado del periodo" siempre usa el mes calendario actual (no configurable desde el dashboard); los reportes de "Liquidado por propietario" y "Viajes por obra" si aceptan un rango de fechas.
- `tripsByDay` del dashboard hace 14 consultas `count` (una por dia) en vez de una sola consulta agregada por fecha — aceptable para el volumen del MVP, primer candidato a optimizar con SQL crudo si el tenant crece.
- El mapa del Monitor en vivo y el selector de coordenadas dependen de tiles de OpenStreetMap sobre internet; sin conexion, el mapa no carga (los datos GPS/coordenadas subyacentes si se guardan y consultan igual).
- **El bloqueo de cuenta admin es por email, no por IP**: un atacante que rote de cuenta no queda frenado por el contador de una cuenta especifica (mitigado por el rate limiting global y el especifico de `/auth/admin/login`, no eliminado). Ver `docs/security.md`.
- **La proteccion CSRF es una mitigacion ligera** (header personalizado en los dos endpoints que dependen solo de la cookie de sesion), no un esquema de token CSRF completo. Suficiente para el alcance actual de la API; a revisar si crece el numero de endpoints cookie-only.
- `GET /audit` no expone un endpoint de exportacion (CSV/Excel) todavia — solo lectura paginada en pantalla.
- **La cobertura de tests es deliberadamente acotada** (ver [Ejecutar pruebas](#ejecutar-pruebas)): unitarios solo sobre `domain/*.ts` (logica pura), sin mocks de Prisma para servicios/controladores; E2E de Playwright cubre 7 flujos criticos, no la totalidad de las pantallas. No hay CI configurado (`.github/workflows` no existe) — las pruebas se corren manualmente.
- No hay pruebas de carga/performance ni de accesibilidad (a11y) automatizadas.
- **El rastreo GPS del conductor solo funciona en primer plano**: el navegador deja de entregar posiciones si el conductor bloquea la pantalla o cambia de pestana (no existe una Background Geolocation API estandar en la web). Una app nativa si podria rastrear en segundo plano — ver `docs/offline-sync.md`.
- **El alcance por dispatcher (`dispatcherId`) no cubre Rates/Materials/FleetOwners**: solo Driver/Vehicle/Project (y lo que cuelga de ellos: sitios, viajes, novedades, dashboard) estan aislados por dispatcher, tal como se pidio. Tarifas, materiales y propietarios de flota siguen siendo compartidos a nivel de tenant.

**Verificado end-to-end en este entorno:** novedad `CRITICAL` reportada por el conductor sobre un viaje activo bloqueandolo automaticamente (`ASSIGNED → BLOCKED_BY_INCIDENT`), resolucion del admin restaurando el viaje a su estado exacto anterior (`BLOCKED_BY_INCIDENT → ASSIGNED`) con la linea de tiempo completa (`INCIDENT_REPORTED` → `INCIDENT_RESOLVED`), conteo de novedades abiertas volviendo a cero, y subida real de un archivo de evidencia (multipart) servido despues correctamente desde `/uploads`. Ciclo completo de liquidaciones contra la API real: preview de 3 viajes `COMPLETED` de un propietario (tarifa `PER_TRIP`), creacion del borrador (viajes → `INCLUDED_IN_SETTLEMENT`), cancelacion revirtiendo los viajes a `COMPLETED`, nueva creacion, dos ajustes (bono + descuento, neteados correctamente en `total`), aprobacion (viajes → `SETTLED`, bloqueo de nuevos ajustes/cancelacion con `SETTLEMENT_NOT_DRAFT`), y descarga real de PDF (`pdfkit`) y Excel (`exceljs`) con contenido no vacio. `GET /reports/dashboard`, `/reports/settlements-by-owner` y `/reports/trips-by-project` verificados contra la API real con los datos del tenant demo (3 viajes activos, 1 liquidacion aprobada por $270.000 COP, 2 novedades abiertas, conteo por dia coincidiendo con los viajes completados el 4 y 5 de agosto). Seguridad de la Fase 11: 6 intentos fallidos consecutivos de login admin dispararon el bloqueo de cuenta (`failedLoginAttempts`/`lockedUntil` confirmados en la base de datos) y el rate limit especifico (`429` en el sexto intento dentro de la misma ventana de 60s); un intento posterior con la contrasena correcta fue rechazado con `401 AUTH_ACCOUNT_LOCKED` hasta resetear el bloqueo; `POST /auth/refresh` sin el header `X-Requested-With` fue rechazado con `403 CSRF_HEADER_MISSING`, y el preflight CORS real del frontend lo permite explicitamente; `GET /audit` verificado tanto como `TENANT_ADMIN` (scope forzado a su tenant) como `SUPER_ADMIN` (`audit:read-global`, sin bloqueo de `TenantScopeGuard`). `tsc --noEmit` limpio en `api` y `web`; `/incidents`, `/settlements`, `/dashboard`, `/reports`, `/monitor`, `/operational-sites`, `/audit` y `/driver/trip/[id]` compilan y sirven 200. Fase 12: `pnpm --filter @valtic/api test` — 42/42 tests unitarios pasando; `pnpm --filter @valtic/api prisma migrate reset --force` (reset completo de la base de datos) seguido del seed corriendo sin errores y produciendo exactamente los 8 viajes y la liquidacion esperados, verificados via API real tras el reset; `pnpm --filter @valtic/web test:e2e` — 7/7 tests de Playwright pasando contra `pnpm dev:api` + `pnpm dev:web` reales, sin mocks.

## Roadmap de fases

Ver el detalle completo de fases y alcance en la respuesta de planificacion tecnica (Fase 1). Resumen:

1. ✅ Definicion tecnica
2. ✅ Fundaciones
3. ✅ Autenticacion y multi-tenancy
4. ✅ Datos maestros
5. ✅ Gestion de viajes
6. ✅ Experiencia del conductor (GPS, offline)
7. ✅ QR y geocercas
8. ✅ Novedades
9. ✅ Liquidaciones
10. ✅ Dashboard y reportes
11. ✅ Auditoria y seguridad
12. ✅ Pruebas y documentacion final

**MVP completo — las 12 fases planeadas estan implementadas y verificadas end-to-end contra servicios reales.** Las limitaciones conocidas y el trabajo pendiente para produccion estan documentados explicitamente en cada seccion de este README y en `docs/*.md` — ninguna funcionalidad se declara terminada sin haber sido probada contra la API y la base de datos reales.

## Cambios post-MVP

Ronda de ajustes solicitados despues de cerrar las 12 fases, ya verificados end-to-end:

1. **Sesiones que se cerraban muy rapido**: el access token (15 min) solo se renovaba de forma reactiva (al recibir un `401`). `apps/web/hooks/use-session-keep-alive.ts` ahora lo renueva de forma proactiva cada 8 minutos mientras la sesion siga activa, y tambien al recuperar el foco de la pestana.
2. **Necesidad de refrescar la pagina para ver cambios**: `QueryProvider` tenia `staleTime: 30_000` y `refetchOnWindowFocus: false`. Ahora `staleTime: 0` y `refetchOnWindowFocus: true` — cada pantalla revalida al montar y al volver a la pestana.
3. **Cada dispatcher con datos unicos**: `Driver`, `Vehicle` y `Project` tienen un nuevo campo `dispatcherId`. Un `DISPATCHER` ve y gestiona solo sus propios conductores, vehiculos y obras (y lo que cuelga de ellos: puntos operativos, viajes, novedades, dashboard); `TENANT_ADMIN` sigue viendo todo el tenant. Detalle completo en `docs/roles-and-permissions.md#alcance-por-propietario-dispatcher-scope`.
4. **DISPATCHER puede resolver novedades de sus propios conductores**: antes cualquier actor con `incidents:resolve` podia resolver cualquier novedad del tenant; ahora un dispatcher solo puede resolver las de sus propios conductores (`404` si intenta con la de otro).
5. Consecuencia directa de (3): se adapto todo el backend (drivers, vehicles, projects, operational-sites, trips, incidents, driver-vehicle-assignments, reports) para aplicar este alcance de forma consistente. El frontend no requirio cambios — ninguna pantalla hacia gating de permisos en el cliente, asi que las mismas paginas ya muestran el conjunto correcto de datos segun el actor.
6. **GPS real, no simulado**: se elimino el simulador de movimiento (`gps-simulator.ts`) y se reemplazo por `useGpsTracking` (`apps/web/lib/driver/gps-tracking.ts`), que usa `navigator.geolocation.watchPosition` real. El rastreo se activa automaticamente cuando el viaje entra en un estado "en curso" (pide permiso de ubicacion al navegador en ese momento) y se detiene automaticamente al salir de esos estados — sin boton manual. Ver `docs/offline-sync.md#rastreo-gps-real`.
7. **Rediseno del panel para DISPATCHER**: el sidebar (`components/layout/sidebar.tsx`) ahora filtra cada item por el permiso del usuario (`hooks/use-permissions.ts`) en vez de mostrar el mismo menu a cualquier actor autenticado. Un `DISPATCHER` ya no ve "Propietarios", "Materiales", "Tarifas", "Liquidaciones" ni "Auditoria" — catalogos/config compartidos del tenant o modulos financieros/de auditoria que no gestiona. El reporte "Liquidado por propietario" (`GET /reports/settlements-by-owner`) ahora exige `settlements:manage` (antes bastaba `reports:read`, que un dispatcher si tiene) — un dispatcher solo veia esa restriccion en la UI, pero la API seguia devolviendo montos liquidados de todo el tenant a cualquiera con `reports:read`; ahora el backend tambien lo bloquea. El Dashboard y el header muestran copy adaptado al rol ("tu operacion" / "Mis conductores disponibles" para dispatcher, etiquetas de rol en espanol). Cubierto por `apps/web/e2e/dispatcher-scope.spec.ts`.
8. **Rediseno visual monocromatico + responsive**: la paleta de colores (`apps/web/app/globals.css`) paso de un azul corporativo a blanco/negro/grises — `primary`, `secondary`, `accent`, `sidebar*`, `border`, `ring` ahora son escala de grises en ambos temas (claro/oscuro); `destructive` (rojo), `success` (verde) y `warning` (ambar) se mantienen sin cambios porque son la unica senal de estado en pantallas operativas (una novedad critica, un vehiculo en mantenimiento) y perderlos habria danado la lectura rapida del panel — solo `info` (antes azul) paso a gris neutro. Como el sistema de diseño ya vivia 100% en tokens CSS (`tailwind.config.ts` mapea todo a `hsl(var(--x))`, sin un solo color hardcodeado en `app/`), el cambio de paleta no toco ninguna pagina. Ademas se corrigio un vacio real de responsividad: el sidebar (`hidden md:flex`) no tenia ninguna alternativa por debajo de 768px — un administrador en celular o tablet no podia navegar el panel en absoluto. Se agrego `components/ui/sheet.tsx` (drawer basado en `@radix-ui/react-dialog`, mismo patron que `Dialog`) y `components/layout/mobile-nav.tsx` (boton de hamburguesa + panel deslizante, visible solo `md:hidden`), reutilizando la misma lista de navegacion (`nav-items.ts` + `nav-links.tsx`) que el sidebar de escritorio para no duplicar la logica de permisos. Tambien se corrigieron ~24 grillas de formularios dentro de dialogos (`grid-cols-2`/`grid-cols-3` sin prefijo de breakpoint, que se veian apretadas en movil) a `grid-cols-1 sm:grid-cols-2`/`sm:grid-cols-3`, y las filas de encabezado/filtros de cada pantalla para que se apilen (`flex-col sm:flex-row`) o envuelvan (`flex-wrap`) en vez de desbordar horizontalmente. Cubierto por `apps/web/e2e/responsive-nav.spec.ts` (confirma que el sidebar fijo se oculta y el drawer permite navegar en un viewport de 375px, y que el drawer no aparece en escritorio).
#   v a l t i c  
 