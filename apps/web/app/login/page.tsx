"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn, Truck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { adminLoginSchema, type AdminLoginInput } from "@valtic/validation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Logo } from "@/components/brand/logo";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

const LEGAL_DOCUMENTS = [
  { label: "Terminos y Condiciones", href: "/legal/terminos-y-condiciones.pdf" },
  { label: "Politica de Tratamiento de Datos", href: "/legal/politica-tratamiento-datos-personales.pdf" },
] as const;

interface AdminLoginResponse {
  accessToken: string;
  user: {
    id: string;
    tenantId: string | null;
    firstName: string;
    lastName: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
}

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const setUserSession = useAuthStore((state) => state.setUserSession);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openLegalDoc, setOpenLegalDoc] = useState<(typeof LEGAL_DOCUMENTS)[number] | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLoginInput>({ resolver: zodResolver(adminLoginSchema) });

  async function onSubmit(values: AdminLoginInput): Promise<void> {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const result = await apiClient.post<AdminLoginResponse>("/auth/admin/login", values);
      setUserSession(result.accessToken, result.user);
      router.push("/dashboard");
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.response.message);
      } else {
        setServerError("No se pudo conectar con el servidor. Intenta de nuevo.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Logo size={44} className="mb-2" />
          <CardTitle className="text-lg font-semibold text-foreground">Ingresar a VALTIC</CardTitle>
          <p className="text-sm text-muted-foreground">Panel administrativo para empresas contratistas.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Correo electronico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="admin@empresa.com"
                {...register("email")}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Contrasena
                </label>
                <a href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  ¿Olvidaste tu contrasena?
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="********"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            {serverError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</p>
            )}

            <Button
              type="submit"
              className="w-full bg-green-600 text-white hover:bg-green-700"
              disabled={isSubmitting}
            >
              <LogIn className="h-4 w-4" />
              {isSubmitting ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>

          <Button
            type="button"
            variant="destructive"
            className="mt-4 w-full"
            onClick={() => router.push("/driver/login")}
          >
            <Truck className="h-4 w-4" />
            Soy Conductor
          </Button>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            {LEGAL_DOCUMENTS.map((legalDoc) => (
              <button
                key={legalDoc.href}
                type="button"
                className="underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setOpenLegalDoc(legalDoc)}
              >
                {legalDoc.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={openLegalDoc !== null} onOpenChange={(open) => !open && setOpenLegalDoc(null)}>
        <DialogContent className="flex h-[90vh] w-full max-w-4xl flex-col">
          <DialogTitle>{openLegalDoc?.label}</DialogTitle>
          {openLegalDoc && (
            <iframe
              src={openLegalDoc.href}
              title={openLegalDoc.label}
              className="h-full w-full flex-1 rounded-md border border-border"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
