# Dashboard y reportes (Fase 10)

Modulo de solo lectura que agrega datos ya existentes (viajes, novedades, vehiculos, conductores, liquidaciones) para el Dashboard y la pantalla de Reportes. No introduce nuevas entidades — es la primera vez que el backend usa `groupBy`/`aggregate` de Prisma (ver [`reports.service.ts`](../apps/api/src/modules/reports/reports.service.ts)).

## Endpoints

| Endpoint | Permiso | Notas |
|---|---|---|
| `GET /reports/dashboard` | `reports:read` | KPIs generales + viajes completados por dia (ultimos 14 dias) |
| `GET /reports/settlements-by-owner` | `reports:read` | `periodStart`/`periodEnd` opcionales (default: mes calendario actual). Suma `Settlement.total` con `status` en `APPROVED`/`PAID`, agrupado por `fleetOwnerId` |
| `GET /reports/trips-by-project` | `reports:read` | Mismo filtro de periodo; cuenta viajes con `completedAt` en el rango, agrupado por `projectId` |

## Definicion de cada KPI del dashboard

| KPI | Calculo |
|---|---|
| Viajes activos | `Trip.count` con `status` en cualquier estado no terminal y no `COMPLETED`/`INCLUDED_IN_SETTLEMENT`/`SETTLED` |
| Completados hoy | `Trip.count` con `completedAt >= inicio del dia (UTC)` — no filtra por `status` actual, porque un viaje completado hoy puede haber avanzado a `INCLUDED_IN_SETTLEMENT`/`SETTLED` el mismo dia y `completedAt` no cambia en esas transiciones |
| Pendientes de revision | `Trip.count` con `status = UNDER_REVIEW` |
| Novedades abiertas | `Incident.count` con `status = OPEN` (mismo dato que el badge del sidebar) |
| Vehiculos activos | `Vehicle.count` con `status = ACTIVE` |
| Conductores disponibles | Conductores `ACTIVE` que no tienen ningun viaje en un estado "en curso" en este momento |
| Valor liquidado del periodo | Suma de `Settlement.total` con `status` en `APPROVED`/`PAID` y `approvedAt` dentro del mes calendario actual |

## Limitaciones conocidas

- **Sin cache**: cada llamada recalcula todo con consultas en vivo a Postgres. Aceptable para el volumen del MVP; si el tenant crece, `tripsByDay` (14 consultas `count`, una por dia) seria el primer candidato a optimizar con una sola consulta agregada por fecha (requiere SQL crudo con `date_trunc`, evitado aqui para no introducir SQL nativo antes de que sea necesario).
- **"Conductores disponibles" es una aproximacion**: un conductor sin viaje activo en el sistema puede seguir sin estar realmente disponible (vacaciones, descanso, etc.) — no hay un estado de disponibilidad explicito en el modelo `Driver`.
- **"Valor liquidado del periodo" usa el mes calendario del reloj del servidor**, no un periodo configurable desde el dashboard (a diferencia de `/reports/settlements-by-owner` y `/reports/trips-by-project`, que si aceptan `periodStart`/`periodEnd`).

## Mapa en vivo (Monitor) y selector de coordenadas (Puntos operativos)

Ambos usan `react-leaflet` + `leaflet` (ya estaban en `apps/web/package.json`, solo faltaba conectarlos) con tiles de OpenStreetMap. Se cargan con `next/dynamic({ ssr: false })` porque Leaflet depende de `window` y rompe el render en servidor de Next.js.

- **Monitor en vivo** (`apps/web/components/admin/trip-map.tsx`): boton "Mapa" por viaje activo abre un dialogo que consulta `GET /locations/trip/:tripId` (ya existente desde la Fase 6), dibuja la polilinea del recorrido y marca el punto de inicio (verde) y la ultima posicion conocida (azul). Se refresca cada 15s mientras el dialogo esta abierto, igual que la tabla.
- **Puntos operativos** (`apps/web/components/admin/site-map-picker.tsx`): clic en el mapa o arrastre del marcador actualiza `latitude`/`longitude` en el formulario (React Hook Form), y dibuja un circulo con el radio de geocerca actual (`geofenceRadius`) para visualizar la zona antes de guardar. Los campos numericos siguen editables para ingreso manual preciso.
- Se usa `L.divIcon` (marcador dibujado en CSS) en vez del icono por defecto de Leaflet para evitar el problema conocido de rutas de imagen rotas bajo bundlers como Webpack/Next.js.
