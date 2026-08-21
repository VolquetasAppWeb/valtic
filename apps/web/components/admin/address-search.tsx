"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import type { GeocodeResult } from "@/lib/geocode";

interface AddressSearchProps {
  placeholder?: string;
  onSelect: (result: GeocodeResult) => void;
  // Direccion con la que arrancar la busqueda sola, sin que el usuario
  // tenga que escribir ni hacer clic — para cuando ya se sabe el texto de
  // antemano (ej. la direccion que extrajo la IA de una orden de trabajo
  // dictada por audio). Se dispara una sola vez al montar el componente.
  initialQuery?: string;
  // Si al buscar `initialQuery` hay resultados, ubica automaticamente el
  // primero (llama a onSelect solo) en vez de esperar a que el usuario
  // elija uno de la lista — pensado para el flujo automatico, no para
  // busquedas manuales posteriores.
  autoSelectFirst?: boolean;
}

// Caja de busqueda de ubicacion para un punto operativo, sin tener que
// encontrarlo a ojo en el mapa. No busca solo la direccion literal: manda
// lo que se escriba (incluso una descripcion coloquial, ej. "la Caracas
// con 72") a Gemini para que la convierta en direcciones formales, y cada
// una se geocodifica para conseguir coordenadas reales (ver POST
// /operations/resolve-address). El pin sigue siendo arrastrable despues
// para el ajuste fino.
export function AddressSearch({ placeholder = "Buscar direccion...", onSelect, initialQuery, autoSelectFirst }: AddressSearchProps): JSX.Element {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  // Solo el primer disparo (el automatico con initialQuery) debe auto-
  // seleccionar un resultado; cualquier busqueda posterior que teclee el
  // usuario a mano siempre espera a que el elija de la lista.
  const pendingAutoSelectRef = useRef(!!(initialQuery && autoSelectFirst));

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const isAutoTriggered = pendingAutoSelectRef.current && query === initialQuery;
    debounceRef.current = setTimeout(
      async () => {
        setIsSearching(true);
        try {
          // La busqueda automatica (isAutoTriggered) siempre parte de una
          // direccion que ya salio de un paso de IA anterior (ej. la orden
          // de trabajo dictada) — pedirle a Gemini que la "normalice" de
          // nuevo solo suma una vuelta de red sin mejorar el resultado, asi
          // que esa se geocodifica directo (skipAi) para que el pin
          // aparezca lo mas rapido posible. Las busquedas manuales si usan
          // el flujo completo con IA (necesario para texto coloquial).
          const skipAiParam = isAutoTriggered ? "&skipAi=true" : "";
          const found = await apiClient.get<GeocodeResult[]>(
            `/operations/resolve-address?query=${encodeURIComponent(query)}${skipAiParam}`,
          );
          setResults(found);
          if (isAutoTriggered && found.length > 0) {
            pendingAutoSelectRef.current = false;
            onSelect(found[0]!);
            setQuery(found[0]!.displayName);
            setOpen(false);
          } else {
            pendingAutoSelectRef.current = false;
            setOpen(true);
          }
        } catch {
          setResults([]);
          pendingAutoSelectRef.current = false;
          setOpen(true);
        } finally {
          setIsSearching(false);
        }
      },
      // La busqueda automatica al montar no necesita esperar a que el
      // usuario "termine de escribir" — dispara casi de inmediato.
      isAutoTriggered ? 50 : 700,
    );
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            pendingAutoSelectRef.current = false;
            setQuery(e.target.value);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="pl-9"
        />
        {isSearching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">Buscando...</span>
        )}
      </div>
      {open && query.trim().length >= 3 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {isSearching ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Buscando...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados.</p>
          ) : (
            results.map((result, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  onSelect(result);
                  setQuery(result.displayName);
                  setOpen(false);
                }}
                className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-secondary/50"
              >
                {result.displayName}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
