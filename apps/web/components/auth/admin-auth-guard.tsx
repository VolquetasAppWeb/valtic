"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { bootstrapSession } from "@/lib/auth-bootstrap";
import { useSessionKeepAlive } from "@/hooks/use-session-keep-alive";

export function AdminAuthGuard({ children }: { children: React.ReactNode }): JSX.Element | null {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const kind = useAuthStore((state) => state.kind);

  useEffect(() => {
    if (status === "idle") {
      void bootstrapSession();
    }
  }, [status]);

  useSessionKeepAlive(status);

  useEffect(() => {
    if (status === "unauthenticated" || (status === "authenticated" && kind !== "user")) {
      router.replace("/login");
    }
  }, [status, kind, router]);

  if (status !== "authenticated" || kind !== "user") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Verificando sesion...</p>
      </div>
    );
  }

  return <>{children}</>;
}
