"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

const markerIcon = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const DEFAULT_CENTER: [number, number] = [4.711, -74.0721]; // Bogota, punto de partida sin coordenadas aun

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }): null {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface SiteMapPickerProps {
  latitude: number;
  longitude: number;
  radius: number;
  onChange: (lat: number, lng: number) => void;
}

export default function SiteMapPicker({ latitude, longitude, radius, onChange }: SiteMapPickerProps): JSX.Element {
  const hasCoordinates = latitude !== 0 || longitude !== 0;
  const center: [number, number] = hasCoordinates ? [latitude, longitude] : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={hasCoordinates ? 16 : 11} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onChange={onChange} />
      {hasCoordinates && (
        <>
          <Marker
            position={[latitude, longitude]}
            icon={markerIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const position = (e.target as L.Marker).getLatLng();
                onChange(position.lat, position.lng);
              },
            }}
          />
          <Circle center={[latitude, longitude]} radius={radius} pathOptions={{ color: "#2563eb", fillOpacity: 0.1 }} />
        </>
      )}
    </MapContainer>
  );
}
