"use client";

import { useEffect, useRef } from "react";
import { useDriverRuntimeStore } from "@/stores/driver-runtime-store";
import { countPendingOutboxEvents } from "@/lib/driver/outbox";
import { syncOutbox } from "@/lib/driver/sync-engine";

// Bajado de 10s a 4s para que la ubicacion del conductor le llegue al
// despachador casi en tiempo real en "Monitor en vivo".
const SYNC_INTERVAL_MS = 4_000;

// Motor de sincronizacion del conductor: corre una sola vez por sesion
// (montado en el layout de /driver), sin importar en que pantalla este.
export function useDriverSync(): void {
  const setOnline = useDriverRuntimeStore((state) => state.setOnline);
  const setPendingCount = useDriverRuntimeStore((state) => state.setPendingCount);
  const setLastSyncAt = useDriverRuntimeStore((state) => state.setLastSyncAt);
  const setSyncing = useDriverRuntimeStore((state) => state.setSyncing);
  const runningRef = useRef(false);

  async function refreshPendingCount(): Promise<void> {
    try {
      const count = await countPendingOutboxEvents();
      setPendingCount(count);
    } catch {
      // IndexedDB no disponible (SSR o navegador sin soporte); se ignora.
    }
  }

  async function runSync(): Promise<void> {
    const { forcedOffline } = useDriverRuntimeStore.getState();
    if (runningRef.current || !navigator.onLine || forcedOffline) return;
    runningRef.current = true;
    setSyncing(true);
    try {
      await syncOutbox();
      setLastSyncAt(new Date().toISOString());
    } catch {
      // El motor ya deja los eventos en FAILED/PENDING para reintentar.
    } finally {
      await refreshPendingCount();
      setSyncing(false);
      runningRef.current = false;
    }
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshPendingCount();
    void runSync();

    const handleOnline = () => {
      setOnline(true);
      void runSync();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = window.setInterval(() => {
      void runSync();
    }, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export async function triggerDriverSync(): Promise<void> {
  await syncOutbox();
}
