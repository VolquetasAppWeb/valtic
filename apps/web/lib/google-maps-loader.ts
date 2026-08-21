// Tipado minimo de lo que se usa de la API de Google Maps — evita depender
// del paquete @types/google.maps solo para un puñado de llamadas.
export interface GoogleMapsNamespace {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
    Marker: new (opts: Record<string, unknown>) => GoogleMarker;
    Circle: new (opts: Record<string, unknown>) => { setMap: (map: GoogleMap | null) => void; setRadius: (r: number) => void; setCenter: (pos: { lat: number; lng: number }) => void };
    InfoWindow: new (opts: Record<string, unknown>) => { open: (opts: Record<string, unknown>) => void; close: () => void; setContent: (html: string) => void };
    event: { addListener: (target: unknown, event: string, handler: (e: unknown) => void) => void };
  };
}

export interface GoogleMap {
  setCenter: (pos: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  getZoom: () => number;
}

export interface GoogleMarker {
  setPosition: (pos: { lat: number; lng: number }) => void;
  getPosition: () => { lat: () => number; lng: () => number } | null;
  setMap: (map: GoogleMap | null) => void;
}

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    // Google llama esto (si existe) cuando la key es invalida, la API no
    // esta habilitada en el proyecto de Cloud, o el dominio no esta
    // autorizado — no lanza una excepcion JS normal, asi es como Google
    // documenta detectar el fallo: https://developers.google.com/maps/documentation/javascript/events#auth-errors
    gm_authFailure?: () => void;
  }
}

let loadPromise: Promise<GoogleMapsNamespace> | null = null;

// Estado compartido entre todos los mapas de la pagina: si Google Maps
// falla por un problema de configuracion de la key (no de red), no tiene
// sentido que cada mapa lo vuelva a intentar y muestre su propio error —
// una vez se detecta, todos los mapas de la sesion caen a Leaflet.
let authFailed = false;
const authFailureListeners = new Set<() => void>();

export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

export function hasGoogleMapsAuthFailed(): boolean {
  return authFailed;
}

function registerAuthFailureHandler(): void {
  if (window.gm_authFailure) return; // ya registrado por un mapa anterior
  window.gm_authFailure = () => {
    authFailed = true;
    authFailureListeners.forEach((listener) => listener());
  };
}

// Carga el script de Google Maps JavaScript API una sola vez (aunque se
// monten varios mapas en la misma pagina) — sin este singleton, cada mapa
// intentaria inyectar su propio <script>, y Google se queja si el API se
// carga mas de una vez.
export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadGoogleMaps solo corre en el navegador"));
  }
  registerAuthFailureHandler();
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = "__valticGoogleMapsLoaded";
    (window as unknown as Record<string, () => void>)[callbackName] = () => {
      resolve(window.google!);
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}&loading=async`;
    script.async = true;
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
