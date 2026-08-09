# Funcionamiento offline y sincronizacion

La experiencia del conductor (`/driver`) es offline-first: **toda** accion (progreso del viaje o punto GPS) se escribe primero en un outbox local en IndexedDB, nunca se llama a la API directamente desde un boton. Un motor de sincronizacion vacia ese outbox de forma oportunista, funcione o no la conexion en ese instante.

## Por que todo pasa por el outbox, incluso en linea

Escribir siempre local-primero (en vez de "intentar en linea, guardar local si falla") da un solo camino de codigo que se comporta igual con o sin conexion, y garantiza que nunca se pierde una accion por refrescar la pagina o cerrar la pestana a mitad de una llamada de red.

## Piezas

| Archivo | Responsabilidad |
|---|---|
| [`lib/driver/indexeddb.ts`](../apps/web/lib/driver/indexeddb.ts) | Abre la base `valtic-driver-outbox` (IndexedDB), store `events` con `keyPath: eventId` |
| [`lib/driver/outbox.ts`](../apps/web/lib/driver/outbox.ts) | CRUD del outbox: `addOutboxEvent`, `getSendableEvents`, `updateOutboxEvent`, `removeOutboxEvent`, `countPendingOutboxEvents` |
| [`lib/driver/actions.ts`](../apps/web/lib/driver/actions.ts) | `queueDriverAction` / `queueLocationPoint`: capturan GPS best-effort, escriben en el outbox, disparan un intento de sync sin bloquear la UI |
| [`lib/driver/sync-engine.ts`](../apps/web/lib/driver/sync-engine.ts) | `syncOutbox()`: envia el lote pendiente a `POST /sync/push`, aplica el resultado por evento |
| [`hooks/use-driver-sync.ts`](../apps/web/hooks/use-driver-sync.ts) | Corre una vez por sesion (montado en `app/driver/layout.tsx`): listeners de `online`/`offline`, intervalo cada 10s, contador de pendientes |
| [`lib/driver/geolocation.ts`](../apps/web/lib/driver/geolocation.ts) | Wrapper de `navigator.geolocation` (permiso, `getCurrentPosition`, `watchPosition`) |
| [`lib/driver/gps-tracking.ts`](../apps/web/lib/driver/gps-tracking.ts) | Hook `useGpsTracking(tripId, status)`: rastreo GPS real atado al ciclo de vida del viaje (ver seccion siguiente) |

## Estados de un evento del outbox

`PENDING → SENDING → ACKNOWLEDGED` (se elimina del store al confirmarse) — o `FAILED` (reintentable, con `retryCount`/`lastError`) — o `REQUIRES_REVIEW` (el servidor entendio la solicitud pero no pudo aplicarla, p. ej. una transicion invalida; se conserva para que el conductor o soporte lo revisen, no se reintenta solo).

## Idempotencia

- **Acciones de progreso de viaje**: no dependen de que el servidor recuerde el `eventId`. `TripsService.applyDriverAction` compara el estado actual del viaje contra el estado objetivo de la accion (`DRIVER_PROGRESS_ORDER` en [`trips/domain/driver-actions.ts`](../apps/api/src/modules/trips/domain/driver-actions.ts)): si el viaje ya esta en ese estado o mas adelante, la respuesta es `ACKNOWLEDGED` sin volver a aplicar nada. Esto es mas robusto que un cache de ids ante reinicios del servidor.
- **Puntos GPS**: `LocationPoint.eventId` es `@unique` en la base de datos; `POST /sync/push` inserta con `skipDuplicates: true`, asi que reenviar el mismo punto (por un reintento tras timeout) nunca crea un duplicado.

## Rastreo GPS real

El rastreo de ubicacion usa el GPS real del dispositivo (`navigator.geolocation.watchPosition`), no una simulacion. `useGpsTracking(tripId, status)` (`lib/driver/gps-tracking.ts`) esta atado al **estado del viaje**, no a un boton manual:

- **Cuando empieza a compartir**: en cuanto el viaje entra en cualquiera de los estados "en curso" — `ACCEPTED`, `EN_ROUTE_TO_LOAD`, `LOADING`, `LOADED`, `EN_ROUTE_TO_UNLOAD`, `UNLOADING`. Llamar a `watchPosition` en ese momento dispara el prompt nativo del navegador pidiendo permiso de ubicacion si todavia no se habia otorgado — no hace falta pedirlo aparte.
- **Cuando deja de compartir**: automaticamente al salir de esos estados (viaje validado/completado, cancelado, cerrado manualmente, o enviado a revision) — el `useEffect` limpia el `watchPosition` (`clearPositionWatch`) apenas el `status` cambia. Tambien se limpia si el conductor navega fuera de la pantalla del viaje.
- **Cada punto capturado** se encola con `queueLocationPoint` en el mismo outbox que usa el resto del sistema (funciona igual online/offline), con un intervalo minimo de 8s entre envios aunque el GPS reporte mas seguido.
- **Permiso denegado o dispositivo sin GPS**: la tarjeta "Ubicacion GPS" en la pantalla del viaje muestra el estado exacto (compartiendo / error / sin soporte) en vez de fallar en silencio; el resto de la app sigue funcionando (las acciones de progreso ya capturaban ubicacion best-effort desde antes, ver `queueDriverAction`).
- **Por que no es "background tracking" real**: el navegador solo entrega posiciones mientras la pestana/PWA esta activa (no hay Background Geolocation API estandar en la web); si el conductor bloquea la pantalla o cierra la pestana, el rastreo se detiene hasta que vuelva. Esta es una limitacion de la plataforma web, no del codigo — una app nativa (iOS/Android) si podria rastrear en segundo plano.

## Simulador de conexion

El boton "Simular sin conexion" en la pantalla de viaje activo no desconecta el navegador (no se puede desde JS); en su lugar activa `forcedOffline` en el store de runtime del conductor (`stores/driver-runtime-store.ts`), que el motor de sincronizacion respeta como si `navigator.onLine` fuera `false`. Las acciones y puntos GPS se siguen encolando normalmente — solo se deja de vaciar el outbox — y al desactivar el modo, la siguiente pasada del intervalo (o el evento `online` real) sincroniza todo lo acumulado.

## Endpoints (`/api/v1/sync`)

| Endpoint | Permiso | Que hace |
|---|---|---|
| `POST /sync/push` | `trips:update-own-progress` | Procesa un lote de eventos (`TRIP_ACTION` o `LOCATION`) en orden; cada uno es independiente — uno fallido no bloquea a los demas |
| `GET /sync/pull` | `trips:read-own` | Devuelve el viaje activo del conductor segun el servidor, para reconciliar tras reconectar (por si el despachador cancelo el viaje mientras estaba offline) |
| `POST /sync/acknowledge` | `trips:update-own-progress` | Confirma que el cliente proceso los resultados de un push previo; para eventos de ubicacion verifica que el punto realmente quedo persistido |

`/sync/push` es sincrono: procesa el lote y responde con el resultado de cada evento en la misma llamada. `/sync/acknowledge` existe para que el cliente pueda re-confirmar despues de una respuesta de red incompleta (p. ej. la conexion se cae justo despues de que el servidor ya proceso el push pero antes de que el cliente reciba la respuesta).

## Cierre del viaje (`UNLOADING → PENDING_VALIDATION`)

Requiere escanear/ingresar un QR y validar la geocerca — ver `docs/qr-validation.md` para el detalle completo de esa validacion.
