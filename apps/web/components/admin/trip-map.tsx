"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { hasGoogleMapsAuthFailed, loadGoogleMaps, onGoogleMapsAuthFailure } from "@/lib/google-maps-loader";
import type { LocationPoint } from "@/lib/api-types";

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }): null {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

// Respaldo sin Google Maps: dibuja una linea recta entre los puntos GPS
// crudos — no sigue las calles, pero nunca deja el mapa en blanco.
function LeafletTripMap({ points }: { points: LocationPoint[] }): JSX.Element | null {
  if (points.length === 0) return null;

  const ordered = [...points].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  const positions: [number, number][] = ordered.map((p) => [p.latitude, p.longitude]);
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;

  return (
    <MapContainer center={[last.latitude, last.longitude]} zoom={15} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {positions.length > 1 && <Polyline positions={positions} pathOptions={{ color: "#2563eb", weight: 4 }} />}
      <CircleMarker center={[first.latitude, first.longitude]} radius={7} pathOptions={{ color: "#16a34a", fillColor: "#16a34a", fillOpacity: 1 }} />
      <CircleMarker center={[last.latitude, last.longitude]} radius={7} pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 1 }} />
      {positions.length > 1 && <FitBounds bounds={positions} />}
    </MapContainer>
  );
}

// El API de Directions solo acepta hasta 25 puntos por llamado (origen +
// destino + 23 intermedios) — si el viaje ya reporto mas puntos GPS que
// eso, se toma una muestra pareja en vez de los primeros N (para no perder
// el tramo final del recorrido).
const MAX_INTERMEDIATE_WAYPOINTS = 23;

function thinWaypoints(points: LocationPoint[]): LocationPoint[] {
  if (points.length <= MAX_INTERMEDIATE_WAYPOINTS) return points;
  const step = points.length / MAX_INTERMEDIATE_WAYPOINTS;
  const sampled: LocationPoint[] = [];
  for (let i = 0; i < MAX_INTERMEDIATE_WAYPOINTS; i++) {
    sampled.push(points[Math.floor(i * step)]!);
  }
  return sampled;
}

// Con Google Maps: el recorrido se pide via Directions API (modo DRIVING),
// asi que la linea sigue las calles reales en vez de cortar en linea recta
// entre lecturas GPS sueltas. Si el ruteo falla (ej. puntos sin via
// conocida entre ellos), cae a mostrar los puntos crudos con el mapa
// ajustado a su area en vez de dejar el mapa vacio.
function GoogleTripMap({ points, onFallback }: { points: LocationPoint[]; onFallback: () => void }): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (points.length === 0 || !containerRef.current) return;
    let cancelled = false;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
    const ordered = [...points].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
    const first = ordered[0]!;
    const last = ordered[ordered.length - 1]!;

    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !containerRef.current) return;

        const map = new google.maps.Map(containerRef.current, {
          center: { lat: last.latitude, lng: last.longitude },
          zoom: 15,
        });

        new google.maps.Marker({
          position: { lat: first.latitude, lng: first.longitude },
          map,
          label: { text: "A", color: "#fff" },
          title: "Inicio del recorrido",
        });
        new google.maps.Marker({
          position: { lat: last.latitude, lng: last.longitude },
          map,
          label: { text: "B", color: "#fff" },
          title: "Ubicacion mas reciente",
        });

        if (ordered.length === 1) return;

        const bounds = new google.maps.LatLngBounds();
        ordered.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));

        const intermediate = thinWaypoints(ordered.slice(1, -1)).map((p) => ({
          location: { lat: p.latitude, lng: p.longitude },
          stopover: false,
        }));

        const directionsService = new google.maps.DirectionsService();
        const directionsRenderer = new google.maps.DirectionsRenderer({
          suppressMarkers: true,
          polylineOptions: { strokeColor: "#2563eb", strokeWeight: 4 },
        });
        directionsRenderer.setMap(map);

        directionsService.route(
          {
            origin: { lat: first.latitude, lng: first.longitude },
            destination: { lat: last.latitude, lng: last.longitude },
            waypoints: intermediate,
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (cancelled) return;
            if (status === "OK" && result) {
              directionsRenderer.setDirections(result);
            } else {
              // Sin ruta vial entre los puntos (comun con GPS ruidoso o
              // tramos fuera de via reconocida) — se ajusta el mapa al area
              // cubierta por los puntos crudos en vez de fallar en silencio.
              map.fitBounds(bounds, 24);
            }
          },
        );
      })
      .catch(() => {
        if (!cancelled) onFallback();
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}

export default function TripMap({ points }: { points: LocationPoint[] }): JSX.Element | null {
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [authFailed, setAuthFailed] = useState(hasGoogleMapsAuthFailed());

  useEffect(() => {
    if (!googleMapsApiKey) return;
    return onGoogleMapsAuthFailure(() => setAuthFailed(true));
  }, [googleMapsApiKey]);

  if (points.length === 0) return null;

  const useGoogle = !!googleMapsApiKey && !authFailed;
  return useGoogle ? <GoogleTripMap points={points} onFallback={() => setAuthFailed(true)} /> : <LeafletTripMap points={points} />;
}
