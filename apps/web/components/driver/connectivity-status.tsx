"use client";

import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useDriverRuntimeStore } from "@/stores/driver-runtime-store";
import { cn } from "@/lib/utils";

function formatLastSync(iso: string | null): string {
  if (!iso) return "sin sincronizar";
  const diffSeconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSeconds < 5) return "hace instantes";
  if (diffSeconds < 60) return `hace ${diffSeconds}s`;
  const diffMinutes = Math.round(diffSeconds / 60);
  return `hace ${diffMinutes} min`;
}

export function ConnectivityStatus(): JSX.Element {
  const isOnline = useDriverRuntimeStore((state) => state.isOnline);
  const forcedOffline = useDriverRuntimeStore((state) => state.forcedOffline);
  const pendingCount = useDriverRuntimeStore((state) => state.pendingCount);
  const lastSyncAt = useDriverRuntimeStore((state) => state.lastSyncAt);
  const isSyncing = useDriverRuntimeStore((state) => state.isSyncing);

  const effectivelyOnline = isOnline && !forcedOffline;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs",
        effectivelyOnline ? "border-border bg-secondary/40" : "border-warning/40 bg-warning/10",
      )}
    >
      <div className="flex items-center gap-1.5">
        {effectivelyOnline ? (
          <Wifi className="h-3.5 w-3.5 text-success" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-warning" />
        )}
        <span className="font-medium">{effectivelyOnline ? "En linea" : "Sin conexion"}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        {pendingCount > 0 && <span>{pendingCount} pendiente{pendingCount === 1 ? "" : "s"}</span>}
        <span className="flex items-center gap-1">
          {isSyncing && <RefreshCw className="h-3 w-3 animate-spin" />}
          {formatLastSync(lastSyncAt)}
        </span>
      </div>
    </div>
  );
}
