import { create } from "zustand";
import type { GeolocationPermissionState } from "@/lib/driver/geolocation";

interface DriverRuntimeState {
  isOnline: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  isSyncing: boolean;
  gpsPermission: GeolocationPermissionState;
  simulatorEnabled: boolean;
  forcedOffline: boolean;
  setOnline: (value: boolean) => void;
  setPendingCount: (value: number) => void;
  setLastSyncAt: (value: string) => void;
  setSyncing: (value: boolean) => void;
  setGpsPermission: (value: GeolocationPermissionState) => void;
  setSimulatorEnabled: (value: boolean) => void;
  setForcedOffline: (value: boolean) => void;
}

export const useDriverRuntimeStore = create<DriverRuntimeState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  lastSyncAt: null,
  isSyncing: false,
  gpsPermission: "prompt",
  simulatorEnabled: false,
  forcedOffline: false,
  setOnline: (isOnline) => set({ isOnline }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setGpsPermission: (gpsPermission) => set({ gpsPermission }),
  setSimulatorEnabled: (simulatorEnabled) => set({ simulatorEnabled }),
  setForcedOffline: (forcedOffline) => set({ forcedOffline }),
}));
