"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { useEffect } from "react";
import type { LocationPoint } from "@/lib/api-types";

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }): null {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

export default function TripMap({ points }: { points: LocationPoint[] }): JSX.Element | null {
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
