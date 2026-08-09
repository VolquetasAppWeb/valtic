# Seguridad

Resumen de lo que esta implementado a la fecha (Fase 11) y lo que queda pendiente para produccion.

## Autenticacion y sesiones

- Contrasenas de administradores y PIN de conductores: hash con Argon2 (nunca texto plano, nunca en logs).
- PIN de conductor: bloqueo temporal tras `DRIVER_PIN_MAX_ATTEMPTS` intentos fallidos (`DRIVER_PIN_LOCK_MINUTES`), reseteable solo por un `TENANT_ADMIN`/`DISPATCHER` autenticado.
- **Login de administradores (Fase 11): mismo patron de bloqueo que el PIN de conductor.** Tras `ADMIN_LOGIN_MAX_ATTEMPTS` intentos fallidos (default 5) sobre el mismo `User.email`, la cuenta queda bloqueada `ADMIN_LOGIN_LOCK_MINUTES` (default 15) — incluso si el intento siguiente usa la contrasena correcta, se rechaza con `401 AUTH_ACCOUNT_LOCKED` hasta que expire el bloqueo. Los contadores (`User.failedLoginAttempts`/`lockedUntil`) se resetean en cualquier login exitoso. Verificado end-to-end en este entorno (ver mas abajo).
- Access token JWT de corta duracion (15 min por defecto) firmado con `JWT_ACCESS_SECRET`; los permisos viajan embebidos en el payload (ver `docs/roles-and-permissions.md`).
- Refresh token opaco (no JWT), rotativo, almacenado como hash SHA-256 en base de datos, transportado unicamente en cookie `httpOnly` + `sameSite=lax`. Nunca se expone en el cuerpo de una respuesta.
- Revocacion de sesiones: `/auth/logout` (sesion actual) y `/auth/logout-all` (todas las sesiones del actor).

## Multi-tenancy

- Todo dato operativo esta scoped por `tenantId`, filtrado en el backend (nunca solo en la UI) — ver `TenantScopeGuard` y el patron `@TenantId()` usado en cada servicio.
- El `tenantId` del actor viene exclusivamente del payload del access token verificado, nunca de un parametro de URL o del body de la request (protege contra IDOR: un usuario no puede pasar `tenantId` de otra empresa para leer o modificar sus datos).
- `SUPER_ADMIN` (rol global, sin tenant) esta bloqueado explicitamente de todos los endpoints de datos operativos por el mismo `TenantScopeGuard`.

## Autorizacion

- Basada en permisos (`PermissionsGuard` + `@Permissions(...)`), no en el nombre del rol — un endpoint declara que permisos acepta, y el guard compara contra los permisos del actor.
- QR de checkpoint: firma HMAC-SHA256 con `timingSafeEqual` para la comparacion (evita timing attacks), un solo uso, expiracion corta configurable (`QR_EXPIRATION_SECONDS`). Detalle en `docs/qr-validation.md`.

## Infraestructura HTTP

- `helmet()` para cabeceras HTTP seguras por defecto.
- CORS restringido a un origen configurable (`CORS_ORIGIN`), con `credentials: true` (requerido para las cookies de refresh token).
- Rate limiting global via `@nestjs/throttler` (100 requests/60s por defecto).
- **Rate limiting especifico por endpoint (Fase 11)**, via `@Throttle(...)`, mas estricto que el global en las rutas de mayor riesgo de fuerza bruta:

  | Endpoint | Limite |
  |---|---|
  | `POST /auth/admin/login` | 5 / 60s |
  | `POST /auth/driver/login` | 8 / 60s |
  | `POST /auth/refresh` | 20 / 60s |
  | `POST /qr/validate` | 10 / 60s |

- Validacion de entrada con `class-validator` en cada DTO, `whitelist: true` + `forbidNonWhitelisted: true` en el `ValidationPipe` global (rechaza campos no declarados, no solo los ignora).
- Errores estandarizados (`GlobalExceptionFilter`) con `correlationId`, nunca se filtran stack traces al cliente.

## CSRF (Fase 11)

Los unicos endpoints que dependen exclusivamente de la cookie httpOnly (sin `Authorization: Bearer`) son `POST /auth/refresh` y `POST /auth/logout` — el resto de la API exige el access token en el header, que un sitio malicioso no puede fijar en una peticion cross-site. Para esos dos, `CsrfHeaderGuard` (`apps/api/src/common/guards/csrf-header.guard.ts`) exige el header `X-Requested-With: XMLHttpRequest`, y rechaza con `403 CSRF_HEADER_MISSING` si falta. Un formulario HTML cross-site no puede fijar headers personalizados sin disparar un preflight CORS, que el origen restringido (`CORS_ORIGIN`) bloquea. El frontend (`apps/web/lib/api-client.ts`, `apps/web/lib/auth-bootstrap.ts`) ya envia este header en toda peticion. Verificado end-to-end: una peticion a `/auth/refresh` sin el header se rechaza con 403; el preflight CORS real del frontend (`Origin: http://localhost:3000`) lo permite explicitamente.

## Auditoria

- `AuditService.record()` registra creacion/edicion/cambios de estado de las entidades sensibles (tenants, usuarios, viajes, novedades, QR, liquidaciones) con actor, valores antes/despues, IP, user agent y motivo cuando aplica.
- **`GET /audit` (Fase 11)**: consulta el registro con filtros (`entityType`, `action`, `actorUserId`, `dateFrom`/`dateTo`) y paginacion. El scope de tenant se resuelve segun el permiso del actor, no segun un parametro que el cliente pueda manipular: un actor con `audit:read` (TENANT_ADMIN) queda forzado a su propio `tenantId` sin importar que pida en la query; solo `audit:read-global` (SUPER_ADMIN) puede ver otros tenants o todos — por eso este es el unico controlador de la API que **no** usa `TenantScopeGuard` (que de otra forma bloquearia a SUPER_ADMIN por no tener `tenantId`). Pantalla en `/audit` del panel admin.
- Los eventos de viaje (`TripEvent`) son append-only y forman una cadena de hashes (ver `docs/trip-state-machine.md#cadena-de-eventos-tripevent`) — una alteracion retroactiva de un evento rompe la cadena de los eventos posteriores.

## Manejo de archivos (Fase 8)

- `StorageService` abstrae el backend de almacenamiento (hoy: disco local bajo `STORAGE_LOCAL_PATH`); el contrato (`save(file, subfolder) -> fileUrl`) es el mismo que tendria un driver S3, para poder migrar sin tocar los modulos que lo consumen.
- Validacion de tipo MIME (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`) y tamano maximo (`STORAGE_MAX_FILE_SIZE_MB`) antes de escribir a disco.
- Nombre de archivo generado por UUID (nunca se usa el nombre original del cliente para el path, evita path traversal).
- **Limitacion conocida:** los archivos se sirven desde `/uploads/*` como estaticos publicos, sin URL firmada ni control de acceso — quien tenga la URL puede verla, aunque las URLs no son adivinables (UUID). La seccion 20 del alcance ya anticipa esto ("URLs firmadas para archivos cuando sea posible") como mejora futura, no como requisito del MVP.

## Que nunca se registra en logs

Contrasenas, PIN, access tokens, refresh tokens, datos bancarios completos (`FleetOwner` solo guarda `bankAccountLastFour`, nunca el numero completo), secretos de configuracion, ni el token QR firmado completo.

## Pendiente para produccion (fuera del alcance del MVP)

- URLs firmadas con expiracion para evidencias.
- Rotación de secretos (`JWT_*`, `QR_SIGNING_SECRET`) sin downtime.
- Politica de contrasenas mas alla del minimo de 8 caracteres.
- Cookies `secure: true` (ya condicionado a `NODE_ENV=production`, pendiente de HTTPS real en despliegue).
- El bloqueo de cuenta admin es por email (no por IP): un atacante que rote de cuenta no se ve frenado por el contador de una cuenta especifica. Combinado con el throttle global y el especifico de `/auth/admin/login`, es suficiente para el MVP pero no sustituye un WAF o un servicio anti-bot en produccion.
- La proteccion CSRF actual (header personalizado) es una mitigacion ligera, no un esquema de token CSRF completo (doble submit o sincronizador) — suficiente dado que solo dos endpoints dependen de la cookie sin `Authorization: Bearer`, pero a revisar si el alcance de endpoints cookie-only crece.
