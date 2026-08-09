"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Antes: staleTime 30s + sin refetch al recuperar el foco, lo que
            // obligaba a refrescar la pagina manualmente para ver cambios
            // hechos por otro usuario (u otra pestana). Ahora cada pantalla
            // revalida al montar y al volver a la pestana; las pantallas que
            // necesitan datos "en vivo" ademas usan su propio refetchInterval.
            staleTime: 0,
            refetchOnWindowFocus: true,
            refetchOnMount: true,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
