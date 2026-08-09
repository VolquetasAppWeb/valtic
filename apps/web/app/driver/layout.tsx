import { DriverAuthGuard } from "@/components/auth/driver-auth-guard";
import { DriverSyncProvider } from "@/components/driver/driver-sync-provider";
import { ConnectivityStatus } from "@/components/driver/connectivity-status";
import { Logo } from "@/components/brand/logo";

export default function DriverLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <DriverAuthGuard>
      <DriverSyncProvider>
        <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
          <header className="flex h-14 items-center justify-center gap-2 border-b border-border">
            <Logo size={24} />
            <span className="text-sm font-semibold tracking-tight">VALTIC Conductor</span>
          </header>
          <div className="px-4 pt-4">
            <ConnectivityStatus />
          </div>
          <main className="flex-1 p-4">{children}</main>
        </div>
      </DriverSyncProvider>
    </DriverAuthGuard>
  );
}
