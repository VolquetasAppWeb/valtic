# Liquidaciones (Fase 9)

Modulo que agrupa viajes `COMPLETED` de un propietario de flota en un periodo, calcula su valor a partir del `rateSnapshot` congelado en cada viaje, permite ajustes manuales (bonos, descuentos, correcciones) y produce un documento exportable (PDF/Excel) una vez aprobado.

## Elegibilidad y prevencion de doble liquidacion

Un viaje es elegible cuando `status = COMPLETED` y `completedAt` cae dentro del periodo solicitado (`[periodStart, periodEnd 23:59:59.999]`). Ver [`TripsService.findEligibleForSettlement`](../apps/api/src/modules/trips/trips.service.ts).

No existe un flag "ya liquidado" separado: incluir un viaje en una liquidacion lo transiciona a `INCLUDED_IN_SETTLEMENT` (via la maquina de estados, `assertValidTransition`), lo que automaticamente lo saca de cualquier consulta de elegibilidad futura. Como respaldo ante condiciones de carrera entre el preview y la creacion real, `SettlementItem.tripId` tiene una restriccion unica en la base de datos; si dos liquidaciones intentan incluir el mismo viaje concurrentemente, la segunda falla con `409 TRIP_ALREADY_SETTLED`.

## Calculo por tipo de tarifa

Todo el calculo lee `Trip.rateSnapshot` (congelado al crear el viaje) — **nunca** la tabla `Rate` vigente al momento de liquidar. Ver [`settlement-calculator.ts`](../apps/api/src/modules/settlements/domain/settlement-calculator.ts).

| `rateType` | Cantidad | Total |
|---|---|---|
| `PER_TRIP` / `FIXED` | 1 | `valor tarifa` |
| `PER_TON` / `PER_CUBIC_METER` | `actualQuantity ?? estimatedQuantity` | `cantidad × valor tarifa` |
| `PER_KILOMETER` | distancia Haversine origen→destino (linea recta, en km) | `cantidad × valor tarifa` |

## Ciclo de vida

```text
(preview, no persiste) → DRAFT → APPROVED
                            ↓
                        CANCELLED
```

- **`GET /settlements/preview`**: calcula sin persistir nada — util para que el usuario revise antes de confirmar.
- **`POST /settlements`**: crea el borrador dentro de una transaccion: crea `Settlement` (`DRAFT`), crea un `SettlementItem` por viaje elegible y transiciona cada viaje a `INCLUDED_IN_SETTLEMENT` (`TripsService.includeInSettlement`). Falla con `400 SETTLEMENT_NO_ELIGIBLE_TRIPS` si no hay viajes en el periodo.
- **`POST /settlements/:id/adjustments`**: solo sobre `DRAFT` (ver `getDraftOrThrow`, `400 SETTLEMENT_NOT_DRAFT` en cualquier otro estado). `DEDUCTION` se guarda como monto negativo; `total = subtotal + adjustmentsTotal` se recalcula sumando todos los ajustes.
- **`PATCH /settlements/:id/approve`** (permiso `settlements:approve`, solo `TENANT_ADMIN`): transiciona cada viaje incluido a `SETTLED` y bloquea la liquidacion (ya no admite ajustes ni cancelacion).
- **`PATCH /settlements/:id/cancel`**: revierte cada viaje a `COMPLETED` (bypass explicito de `assertValidTransition`, igual patron que el desbloqueo por incidente), borra los `SettlementItem` y marca la liquidacion `CANCELLED`. Los viajes vuelven a estar disponibles para una liquidacion futura.
- **`GET /settlements/:id/export/pdf`** y **`/export/excel`**: generan el documento final a partir del estado actual de la liquidacion (disponible en cualquier estado, no solo `APPROVED`).

`PAID` esta modelado en el enum de estado pero no tiene endpoint de transicion en el MVP — pendiente de un flujo de conciliacion de pagos futuro.

## Limitaciones conocidas del MVP

- **`PER_KILOMETER` es una aproximacion**: no existe integracion con un motor de ruteo real; se usa distancia en linea recta (Haversine) entre las coordenadas del sitio de origen y destino, no la distancia real recorrida por la via.
- **`actualQuantity` casi nunca esta disponible**: no existe integracion con bascula/pesaje, asi que el calculo de `PER_TON`/`PER_CUBIC_METER` usa `estimatedQuantity` como fallback en la gran mayoria de los casos. Esto es aceptable para el MVP pero debe comunicarse al usuario como una limitacion de precision.
- **`sequentialNumber` de liquidacion** se calcula con un patron `MAX + 1` dentro de la transaccion de creacion — igual que en viajes, puede colisionar bajo alta concurrencia; aceptable para el volumen esperado del MVP.
- No hay endpoint para marcar una liquidacion como `PAID` ni para adjuntar comprobante de pago.

## Endpoints

| Endpoint | Permiso | Notas |
|---|---|---|
| `GET /settlements/preview` | `settlements:manage` | No persiste |
| `POST /settlements` | `settlements:manage` | Crea el borrador |
| `GET /settlements` | `settlements:manage` | Paginado, filtros `fleetOwnerId`, `status` |
| `GET /settlements/:id` | `settlements:manage` | Incluye items y ajustes |
| `POST /settlements/:id/adjustments` | `settlements:manage` | Solo `DRAFT` |
| `PATCH /settlements/:id/approve` | `settlements:approve` | Solo `TENANT_ADMIN`; transiciona viajes a `SETTLED` |
| `PATCH /settlements/:id/cancel` | `settlements:manage` | Solo `DRAFT`; revierte viajes a `COMPLETED` |
| `GET /settlements/:id/export/pdf` | `settlements:manage` | `pdfkit` |
| `GET /settlements/:id/export/excel` | `settlements:manage` | `exceljs` |
