"use client";

import { useDriverSync } from "@/hooks/use-driver-sync";

export function DriverSyncProvider({ children }: { children: React.ReactNode }): JSX.Element {
  useDriverSync();
  return <>{children}</>;
}
