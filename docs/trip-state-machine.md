# Maquina de estados del viaje

Unica fuente de verdad: [`apps/api/src/modules/trips/domain/trip-state-machine.ts`](../apps/api/src/modules/trips/domain/trip-state-machine.ts). Ningun otro punto del backend escribe `Trip.status` directamente — todo pasa por `assertValidTransition(current, target)`, que lanza `400 TRIP_INVALID_TRANSITION` si la transicion no esta permitida.

## Transiciones permitidas

```text
DRAFT → ASSIGNED, CANCELLED
ASSIGNED → ACCEPTED, CANCELLED, MANUALLY_CLOSED
ACCEPTED → EN_ROUTE_TO_LOAD, CANCELLED, MANUALLY_CLOSED
EN_ROUTE_TO_LOAD → LOADING, CANCELLED, MANUALLY_CLOSED
LOADING → LOADED, CANCELLED, MANUALLY_CLOSED
LOADED → EN_ROUTE_TO_UNLOAD, CANCELLED, MANUALLY_CLOSED
EN_ROUTE_TO_UNLOAD → UNLOADING, CANCELLED, MANUALLY_CLOSED
UNLOADING → PENDING_VALIDATION, CANCELLED, MANUALLY_CLOSED
PENDING_VALIDATION → COMPLETED, UNDER_REVIEW, MANUALLY_CLOSED
UNDER_REVIEW → COMPLETED, REJECTED, MANUALLY_CLOSED
COMPLETED → INCLUDED_IN_SETTLEMENT
INCLUDED_IN_SETTLEMENT → SETTLED
SETTLED / MANUALLY_CLOSED / CANCELLED / REJECTED → (terminales, sin salida)
```

`BLOCKED_BY_INCIDENT` esta modelado en el enum y en el schema, pero su disparo automatico (una novedad critica bloquea el viaje y lo devuelve a su estado anterior al resolverse) se conecta en la Fase 8 cuando exista el modulo de novedades. Hasta entonces no hay transicion hacia ese estado.

## Por que el viaje nace en `ASSIGNED`, no en `DRAFT`

El modelo `Trip` exige `driverId`, `vehicleId` y `fleetOwnerId` desde la creacion (no son opcionales en el schema). Por eso `POST /trips` crea el viaje directamente en `ASSIGNED`: en la practica, un despachador siempre asigna conductor y vehiculo al momento de crear el viaje. `DRAFT` queda modelado para un futuro flujo de "borrador sin asignar" si se necesita, pero el MVP no lo usa.

## Snapshot de tarifa

Al crear el viaje, el backend busca la tarifa vigente mas especifica (por `fleetOwnerId` del vehiculo, luego por `vehicleType`, luego general) para la combinacion obra + origen + destino + material, y copia sus datos a `Trip.rateSnapshot` (JSON). Si no hay ninguna tarifa vigente, la creacion falla con `404 TRIP_RATE_NOT_FOUND` — un viaje nunca queda sin una tarifa de referencia. Las liquidaciones (Fase 9) usan este snapshot, nunca la tarifa vigente al momento de liquidar.

## Cadena de eventos (`TripEvent`)

Cada transicion relevante genera un `TripEvent` append-only. El campo `eventHash` se calcula como:

```text
eventHash = SHA256(previousHash + tripId + type + payloadCanonico + occurredAt)
```

`previousHash` es el `eventHash` del evento anterior del mismo viaje (`null` para el primero). `payloadCanonico` es el JSON del payload con las claves ordenadas alfabeticamente, para que el hash sea determinista. Esto da trazabilidad tipo "libro mayor" sin blockchain: cualquier alteracion retroactiva de un evento rompe la cadena de hashes de los eventos posteriores.

Ver [`apps/api/src/modules/trip-events/trip-events.service.ts`](../apps/api/src/modules/trip-events/trip-events.service.ts).

## Endpoints (Fase 5)

| Endpoint | Permiso | Notas |
|---|---|---|
| `POST /trips` | `trips:create` | Crea y asigna en un solo paso; resuelve tarifa; dispara evento `CREATED` |
| `GET /trips` | `trips:read` | Paginado, filtros por `status`, `projectId`, `driverId`, `vehicleId` |
| `GET /trips/active` | `trips:read` | Viajes no terminados, usado por el Monitor en vivo |
| `GET /trips/:id` | `trips:read` | Incluye la linea de tiempo completa (`events`) |
| `PATCH /trips/:id/cancel` | `trips:cancel` | Exige `reason` (min. 5 caracteres) |
| `PATCH /trips/:id/manual-close` | `trips:manual-close` | Exige `reason`; queda en auditoria |

Las transiciones de progreso del conductor (`ACCEPTED`, `EN_ROUTE_TO_LOAD`, `LOADING`, etc.) no tienen endpoint todavia — se agregan en la Fase 6 junto con la experiencia del conductor, usando el mismo `assertValidTransition` y el mismo `TripEventsService`.

## Concurrencia

`Trip.version` se usa como lock optimista: `cancel` y `manual-close` actualizan con `where: { id, version }`; si otro proceso ya modifico el viaje, Prisma no encuentra la fila y el update falla (a futuro se mapea a un error de conflicto explicito). El numero secuencial del viaje (`sequentialNumber`) se calcula dentro de una transaccion `MAX + 1` por tenant; bajo alta concurrencia esto puede colisionar — aceptable para el volumen del MVP, documentado como limitacion conocida.
