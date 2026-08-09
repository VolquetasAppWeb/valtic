"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { bootstrapSession } from "@/lib/auth-bootstrap";
import { useSessionKeepAlive } from "@/hooks/use-session-keep-alive";

export function DriverAuthGuard({ children }: { children: React.ReactNode }): JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const kind = useAuthStore((state) => state.kind);
  const isLoginRoute = pathname === "/driver/login";

  useEffect(() => {
    if (status === "idle") {
      void bootstrapSession();
    }
  }, [status]);

  useSessionKeepAlive(status);

  useEffect(() => {
    if (isLoginRoute) {
      return;
    }
    if (status === "unauthenticated" || (status === "authenticated" && kind !== "driver")) {
      router.replace("/driver/login");
    }
  }, [status, kind, router, isLoginRoute]);

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (status !== "authenticated" || kind !== "driver") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Verificando sesion...</p>
      </div>
    );
  }

  return <>{children}</>;
}
