"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { apiClient, ApiError } from "@/lib/api-client";

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "La contrasena debe tener minimo 8 caracteres"),
    confirmPassword: z.string().min(8, "La contrasena debe tener minimo 8 caracteres"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contrasenas no coinciden",
    path: ["confirmPassword"],
  });

type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

function ResetPasswordContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  async function onSubmit(values: ResetPasswordInput): Promise<void> {
    if (!token) {
      setServerError("El enlace no es valido. Solicita uno nuevo.");
      return;
    }
    setServerError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post("/auth/reset-password", { token, newPassword: values.newPassword });
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.response.message : "No se pudo conectar con el servidor. Intenta de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Logo size={44} className="mb-2" />
          <CardTitle className="text-lg font-semibold text-foreground">Elegir nueva contrasena</CardTitle>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Este enlace no es valido. Solicita uno nuevo desde{" "}
              <a href="/forgot-password" className="font-medium underline">
                recuperar contrasena
              </a>
              .
            </p>
          ) : success ? (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm text-foreground">
              Contrasena actualizada. Te llevamos a iniciar sesion...
            </p>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="space-y-1.5">
                <label htmlFor="newPassword" className="text-sm font-medium">
                  Nueva contrasena
                </label>
                <input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="********"
                  {...register("newPassword")}
                />
                {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirmar contrasena
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="********"
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>

              {serverError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</p>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Restablecer contrasena"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
