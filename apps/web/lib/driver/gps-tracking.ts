"use client";

import { useEffect, useRef, useState } from "react";
import {
  checkGeolocationPermission,
  clearPositionWatch,
  watchPosition,
  type CapturedPosition,
  type GeolocationPermissionState,
} from "./geolocation";
import { queueLocationPoint } from "./actions";
import type { TripStatus } from "@/lib/api-types";

// El "turno" de rastreo es la duracion del viaje activo: desde que el
// conductor lo acepta hasta que llega al punto de descargue. Antes de
// ACCEPTED no hay nada que rastrear (el viaje ni empezo); desde
// PENDING_VALIDATION en adelante (validacion QR, revision, cierre) el
// conductor ya no se esta moviendo, asi que se deja de compartir.
const TRACKING_STATUSES: TripStatus[] = [
  "ACCEPTED",
  "EN_ROUTE_TO_LOAD",
  "LOADING",
  "LOADED",
  "EN_ROUTE_TO_UNLOAD",
  "UNLOADING",
];

// No enviamos cada posicion que entrega watchPosition (puede disparar muy
// seguido con GPS de alta precision) — se agrupan con este intervalo minimo.
// Se bajo de 8s a 4s para que "Monitor en vivo" se sienta realmente en vivo
// (el monitor ahora sondea cada 5s del lado del despachador).
const MIN_SEND_INTERVAL_MS = 4_000;

// Una posicion con accuracy de cientos/miles de metros (comun con
// triangulacion por WiFi/red movil, sin señal GPS real) no sirve para
// ubicar al conductor en el mapa del despachador. No se comparte ni se
// marca "compartiendo" hasta tener una lectura con precision real de GPS.
const MAX_ACCEPTABLE_ACCURACY_METERS = 10;

export interface GpsTrackingState {
  sharing: boolean;
  permission: GeolocationPermissionState;
  lastPosition: CapturedPosition | null;
  error: string | null;
  // true cuando hay señal pero la precision todavia no es suficiente
  // (>10m) — util para mostrar "buscando señal GPS precisa..." en vez de
  // "compartiendo" con un numero enganoso.
  waitingForAccuracy: boolean;
}

export function useGpsTracking(tripId: string | undefined, status: TripStatus | undefined): GpsTrackingState {
  const [permission, setPermission] = useState<GeolocationPermissionState>("prompt");
  const [sharing, setSharing] = useState(false);
  const [waitingForAccuracy, setWaitingForAccuracy] = useState(false);
  const [lastPosition, setLastPosition] = useState<CapturedPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);

  const shouldTrack = !!tripId && !!status && TRACKING_STATUSES.includes(status);

  useEffect(() => {
    if (!shouldTrack) {
      setSharing(false);
      return;
    }

    let cancelled = false;

    void checkGeolocationPermission().then((state) => {
      if (!cancelled) setPermission(state);
    });

    // watchPosition dispara el prompt nativo de permiso del navegador la
    // primera vez que se llama (si el estado es "prompt"); no hace falta
    // pedirlo por separado.
    const id = watchPosition(
      (position) => {
        if (cancelled) return;
        setPermission("granted");
        setError(null);

        if (position.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
          // Se descarta: no es una posicion util para el mapa del
          // despachador. Se sigue escuchando (watchPosition no se detiene)
          // hasta que el GPS entregue una lectura mas precisa.
          setSharing(false);
          setWaitingForAccuracy(true);
          setLastPosition(position);
          return;
        }

        setLastPosition(position);
        setSharing(true);
        setWaitingForAccuracy(false);

        const now = Date.now();
        if (now - lastSentAtRef.current >= MIN_SEND_INTERVAL_MS) {
          lastSentAtRef.current = now;
          void queueLocationPoint(tripId!, {
            latitude: position.latitude,
            longitude: position.longitude,
            accuracy: position.accuracy,
            altitude: position.altitude,
            speed: position.speed,
            heading: position.heading,
          });
        }
      },
      (geoError) => {
        if (cancelled) return;
        setSharing(false);
        setWaitingForAccuracy(false);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setPermission("denied");
          setError("Permiso de ubicacion denegado. Actívalo en los ajustes del navegador para compartir tu recorrido.");
        } else if (geoError.code === geoError.TIMEOUT) {
          setError("No se pudo obtener la ubicacion (tiempo agotado). Reintentando...");
        } else {
          setError("No se pudo obtener la ubicacion GPS del dispositivo.");
        }
      },
    );
    watchIdRef.current = id;
    if (id === null) {
      setError("Este dispositivo no soporta geolocalizacion.");
      setPermission("unsupported");
    }

    return () => {
      cancelled = true;
      clearPositionWatch(watchIdRef.current);
      watchIdRef.current = null;
      setSharing(false);
      setWaitingForAccuracy(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldTrack, tripId]);

  return { sharing, permission, lastPosition, error, waitingForAccuracy };
}
