"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { apiClient } from "@/lib/api-client";

const forgotPasswordSchema = z.object({
  email: z.string().email("Correo invalido"),
});

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage(): JSX.Element {
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: ForgotPasswordInput): Promise<void> {
    setIsSubmitting(true);
    try {
      await apiClient.post("/auth/forgot-password", values);
    } catch {
      // Se ignora deliberadamente: el backend siempre responde exito para no
      // revelar si el correo esta registrado.
    } finally {
      setIsSubmitting(false);
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Logo size={44} className="mb-2" />
          <CardTitle className="text-lg font-semibold text-foreground">Recuperar contrasena</CardTitle>
          <p className="text-sm text-muted-foreground">
            Escribe tu correo y te enviamos un enlace para restablecer tu contrasena.
          </p>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="rounded-md bg-secondary px-3 py-2 text-sm text-foreground">
                Si el correo esta registrado, te llegara un enlace en unos minutos. Revisa tambien la carpeta de
                spam/promociones.
              </p>
              <a href="/login" className="block text-center text-sm font-medium text-primary hover:underline">
                Volver a iniciar sesion
              </a>
            </div>
          ) : (
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

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Enviando..." : "Enviar enlace de recuperacion"}
              </Button>

              <a href="/login" className="block text-center text-sm font-medium text-primary hover:underline">
                Volver a iniciar sesion
              </a>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
