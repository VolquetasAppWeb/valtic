"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { loadGoogleMaps, hasGoogleMapsAuthFailed, onGoogleMapsAuthFailure, type GoogleMap, type GoogleMarker } from "@/lib/google-maps-loader";

const DEFAULT_CENTER = { lat: 4.711, lng: -74.0721 }; // Bogota, punto de partida sin coordenadas aun

// El InfoWindow de Google hereda el color de texto del CSS de la pagina
// (el tema oscuro de la app pone el texto en blanco por defecto) y su
// fondo siempre es blanco — sin un color explicito el texto queda blanco
// sobre blanco, ilegible. Tambien escapa el texto: viene del nombre del
// punto que escribe el usuario y se inyecta como HTML.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function infoWindowContent(label: string): string {
  return `<div style="color:#111827;font-weight:600;font-size:13px;white-space:nowrap;">${escapeHtml(label)}</div>`;
}

interface SiteMapPickerProps {
  latitude: number;
  longitude: number;
  radius: number;
  onChange: (lat: number, lng: number) => void;
  label?: string;
}

// Estilo oscuro para que el mapa combine con el resto de la interfaz (igual
// look que Google Maps en modo noche).
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1f2b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1f2b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b93a7" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2a3142" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#242b3a" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1f3327" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4a5568" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3648" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#101722" }] },
];

// Version con Google Maps (mapa real con calles/nombres, igual al que se
// ve en Google Maps o Gemini) — se usa cuando hay una key configurada
// (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY). El pin queda con una etiqueta fija
// encima (igual que un resultado de busqueda en Google Maps) y se puede
// arrastrar o hacer clic en el mapa para reubicarlo.
function GoogleSitePicker({ latitude, longitude, radius, onChange, label = "Punto operativo" }: SiteMapPickerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [error, setError] = useState<string | null>(null);
  const hasCoordinates = latitude !== 0 || longitude !== 0;

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        const center = hasCoordinates ? { lat: latitude, lng: longitude } : DEFAULT_CENTER;

        const map = new google.maps.Map(containerRef.current, {
          center,
          zoom: hasCoordinates ? 16 : 11,
          styles: DARK_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        mapRef.current = map;

        const marker = new google.maps.Marker({
          position: center,
          map: hasCoordinates ? map : null,
          draggable: true,
        });
        markerRef.current = marker;

        const infoWindow = new google.maps.InfoWindow({ content: infoWindowContent(label), disableAutoPan: true });
        if (hasCoordinates) infoWindow.open({ map, anchor: marker });

        const circle = new google.maps.Circle({
          center,
          radius,
          map: hasCoordinates ? map : null,
          strokeColor: "#2563eb",
          fillColor: "#2563eb",
          fillOpacity: 0.1,
          strokeWeight: 1,
        });

        google.maps.event.addListener(marker, "dragend", () => {
          const position = marker.getPosition();
          if (position) onChangeRef.current(position.lat(), position.lng());
        });
        google.maps.event.addListener(map, "click", (e: unknown) => {
          const latLng = (e as { latLng: { lat: () => number; lng: () => number } }).latLng;
          onChangeRef.current(latLng.lat(), latLng.lng());
        });

        // Guardado para poder actualizar posicion/circulo cuando cambien las props.
        (containerRef.current as unknown as { __marker?: GoogleMarker; __circle?: typeof circle; __infoWindow?: typeof infoWindow }).__marker = marker;
        (containerRef.current as unknown as { __circle?: typeof circle }).__circle = circle;
        (containerRef.current as unknown as { __infoWindow?: typeof infoWindow }).__infoWindow = infoWindow;
      })
      .catch(() => setError("No se pudo cargar el mapa."));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentra/actualiza el pin cuando cambian las COORDENADAS por fuera del
  // mapa (ej. seleccionar un resultado del buscador de direcciones). A
  // proposito NO depende de `label`: volver a llamar infoWindow.open() en
  // cada tecla que se escribe en el nombre del punto le robaba el foco al
  // campo de texto (Google reabre la ventana internamente), asi que el
  // usuario solo podia escribir una letra a la vez. El texto de la
  // etiqueta se actualiza aparte, sin reabrir nada (ver el effect de abajo).
  useEffect(() => {
    const container = containerRef.current as unknown as {
      __marker?: GoogleMarker;
      __circle?: { setCenter: (p: { lat: number; lng: number }) => void; setRadius: (r: number) => void; setMap: (m: GoogleMap | null) => void };
      __infoWindow?: { open: (opts: Record<string, unknown>) => void; setContent: (html: string) => void };
    } | null;
    if (!container?.__marker || !mapRef.current || !hasCoordinates) return;
    const position = { lat: latitude, lng: longitude };
    container.__marker.setPosition(position);
    container.__marker.setMap(mapRef.current);
    container.__circle?.setCenter(position);
    container.__circle?.setRadius(radius);
    container.__circle?.setMap(mapRef.current);
    container.__infoWindow?.setContent(infoWindowContent(label));
    container.__infoWindow?.open({ map: mapRef.current, anchor: container.__marker });
    mapRef.current.setCenter(position);
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, radius]);

  // Actualiza solo el texto de la etiqueta cuando cambia el nombre del
  // punto (mientras se escribe) — setContent() por si sola no reabre la
  // ventana ni le quita el foco a nada, a diferencia de open().
  useEffect(() => {
    const container = containerRef.current as unknown as { __infoWindow?: { setContent: (html: string) => void } } | null;
    container?.__infoWindow?.setContent(infoWindowContent(label));
  }, [label]);

  if (error) {
    return <p className="flex h-full items-center justify-center text-xs text-destructive">{error}</p>;
  }
  return <div ref={containerRef} className="h-full w-full" />;
}

const markerIcon = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }): null {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// MapContainer solo usa `center` en el primer render — cuando el pin se
// mueve por una busqueda de direccion (en vez de un clic/arrastre dentro
// del propio mapa) hay que recentrar el mapa a mano.
function RecenterOnChange({ latitude, longitude }: { latitude: number; longitude: number }): null {
  const map = useMap();
  useEffect(() => {
    if (latitude !== 0 || longitude !== 0) {
      map.setView([latitude, longitude], Math.max(map.getZoom(), 15));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);
  return null;
}

// Version de respaldo con Leaflet + tiles de OpenStreetMap (gratis, sin
// key) — se usa cuando no hay NEXT_PUBLIC_GOOGLE_MAPS_API_KEY configurada.
function LeafletSitePicker({ latitude, longitude, radius, onChange }: SiteMapPickerProps): JSX.Element {
  const hasCoordinates = latitude !== 0 || longitude !== 0;
  const center: [number, number] = hasCoordinates ? [latitude, longitude] : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

  return (
    <MapContainer center={center} zoom={hasCoordinates ? 16 : 11} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onChange={onChange} />
      <RecenterOnChange latitude={latitude} longitude={longitude} />
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

// Punto de entrada unico: usa el mapa real de Google (calles, nombres,
// estilo tipo Google Maps) si hay una key configurada; si no, cae de
// vuelta al mapa con Leaflet/OpenStreetMap para que la funcionalidad
// siga disponible sin costo ni configuracion adicional. Tambien cae a
// Leaflet si Google reporta un fallo de autenticacion (key invalida, API
// no habilitada en el proyecto de Cloud, dominio no autorizado, etc) — ese
// tipo de error Google lo maneja con su propio callback global
// (gm_authFailure), no con una excepcion normal que se pueda atrapar con
// try/catch, asi que hay que escucharlo explicitamente.
export default function SiteMapPicker(props: SiteMapPickerProps): JSX.Element {
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [authFailed, setAuthFailed] = useState(hasGoogleMapsAuthFailed());

  useEffect(() => {
    if (!googleMapsApiKey) return;
    return onGoogleMapsAuthFailure(() => setAuthFailed(true));
  }, [googleMapsApiKey]);

  const useGoogle = !!googleMapsApiKey && !authFailed;
  return useGoogle ? <GoogleSitePicker {...props} /> : <LeafletSitePicker {...props} />;
}
