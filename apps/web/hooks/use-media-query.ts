"use client";

import { useEffect, useState } from "react";

// Se usa para cambiar de tabla (escritorio) a lista de tarjetas apiladas
// (celular/tablet) en las pantallas de listados — evita que el usuario
// tenga que desplazarse horizontalmente para ver columnas cortadas. El
// corte en 768px coincide con el que ya usa el sidebar (`hidden md:flex`).
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    setIsMobile(query.matches);
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return isMobile;
}
