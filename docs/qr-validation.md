# QR y validacion de geocerca

Cierra el ciclo del viaje: `UNLOADING → PENDING_VALIDATION → COMPLETED` (geocerca valida) o `→ UNDER_REVIEW` (geocerca invalida, requiere revision manual del admin).

## Estructura del token

El QR no codifica solo el id del viaje — codifica un payload firmado, tal como pide la seccion 14 del alcance:

```json
{
  "version": 1,
  "tenantId": "uuid",
  "siteId": "uuid",
  "checkpointId": "uuid",
  "nonce": "uuid",
  "issuedAt": 1735689600000,
  "expiresAt": 1735689900000
}
```

El token que efectivamente viaja en el QR es `base64url(JSON.stringify({ payload, signature }))`, donde `signature = HMAC-SHA256(canonicalizar(payload), QR_SIGNING_SECRET)`. Ver [`qr-validation/domain/qr-token.ts`](../apps/api/src/modules/qr-validation/domain/qr-token.ts). La verificacion usa `timingSafeEqual` para comparar firmas (evita timing attacks).

## Reglas de validacion (en orden)

1. **Firma valida** — si no coincide, `400 QR_INVALID`.
2. **Tenant coincide** — el payload declara `tenantId`; si no es el del actor, `403 QR_TENANT_MISMATCH`.
3. **No expirado** — `expiresAt` se compara contra la hora del servidor, no la del cliente. `400 QR_EXPIRED`.
4. **Checkpoint existe y esta `ACTIVE`** — si ya se uso, `409 QR_ALREADY_USED`. Si ya vencio en base de datos, se marca `EXPIRED` y responde `400 QR_EXPIRED`.
5. **El viaje existe, es del conductor que escanea, y esta en `UNLOADING`** — de lo contrario `403 TRIP_NOT_OWNED` o `400 TRIP_NOT_READY_FOR_QR`.
6. **El checkpoint pertenece al punto de descargue del viaje** — si no, `400 QR_WRONG_SITE` (evita cerrar un viaje escaneando el QR de otra obra).
7. Solo si las 6 anteriores pasan, el checkpoint se marca `USED` — **de un solo uso independientemente de si la geocerca despues resulta valida**. Esto evita que un conductor reintente indefinidamente con el mismo QR hasta que la ubicacion "cuadre".

## Validacion de geocerca

Formula de Haversine ([`qr-validation/domain/geofence.ts`](../apps/api/src/modules/qr-validation/domain/geofence.ts)), tres condiciones independientes — **todas** deben cumplirse:

| Condicion | Configurable via |
|---|---|
| Distancia al punto operativo ≤ `geofenceRadius` del sitio | Radio propio de cada `OperationalSite` |
| Precision del GPS (`accuracy`) ≤ maximo permitido | `GEOFENCE_MAX_ACCURACY_METERS` (default 50m) |
| Antiguedad de la ubicacion ≤ maximo permitido | `GEOFENCE_MAX_LOCATION_AGE_SECONDS` (default 60s) |

Si falla cualquiera, el viaje pasa a `UNDER_REVIEW` con las razones especificas guardadas en el evento `VALIDATION_FAILED` (no se descarta informacion — se conserva la distancia real y el motivo exacto para que el admin decida con contexto).

## Transiciones que dispara

`TripsService.applyQrValidationResult` (no `QrValidationService` directamente — todo cambio de `Trip.status` sigue centralizado en `TripsService`, mismo principio que en `docs/trip-state-machine.md`):

```text
UNLOADING → PENDING_VALIDATION            (siempre, evento QR_SCANNED)
PENDING_VALIDATION → COMPLETED            (geocerca valida, eventos VALIDATION_PASSED + COMPLETED)
PENDING_VALIDATION → UNDER_REVIEW         (geocerca invalida, evento VALIDATION_FAILED)
UNDER_REVIEW → COMPLETED | REJECTED       (revision manual del admin, PATCH /trips/:id/review)
```

## Endpoints (`/api/v1/qr`)

| Endpoint | Permiso | Notas |
|---|---|---|
| `POST /qr/generate` | `qr:generate` (admin/dispatcher) | Recibe `operationalSiteId`; devuelve `{ token, checkpointId, expiresAt }` |
| `POST /qr/validate` | `qr:validate-scan` (conductor) | Recibe `token`, `tripId`, `deviceId`, `latitude`, `longitude`, `accuracy`, `capturedAt` |
| `PATCH /trips/:id/review` | `trips:review` (admin/dispatcher) | `{ decision: 'APPROVE'\|'REJECT', notes? }` |

`/qr/validate` es deliberadamente **online-only**, fuera del outbox offline de la Fase 6: verificar firma, expiracion y uso unico requiere el reloj y el estado del servidor en el momento exacto del escaneo — encolarlo para sincronizar despues rompe la garantia de un solo uso y el sentido de la expiracion corta.

## MVP web: sin camara todavia

Tal como autoriza explicitamente la seccion 14 del alcance ("Introducir manualmente un codigo en ambientes de desarrollo"), el MVP no incluye renderizado de QR como imagen escaneable ni lectura por camara — habria requerido agregar dependencias (`qrcode`, `@zxing/browser` o similar) y manejo de permisos de camara fuera del alcance ya amplio de esta fase. El panel admin muestra el token como texto (con boton de copiar) y el conductor lo pega en un campo de texto. Migrar a QR real mas adelante es un cambio de UI, no de arquitectura: el token y la validacion de backend no cambian.
