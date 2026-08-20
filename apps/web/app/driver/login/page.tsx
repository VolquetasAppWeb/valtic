"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NumericKeypad, PinDots } from "@/components/driver/numeric-keypad";
import { Logo } from "@/components/brand/logo";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

const DRIVER_AGREEMENT = {
  label: "Acuerdo de Uso para Conductores",
  href: "/legal/acuerdo-uso-conductores.pdf",
};

interface DriverLoginResponse {
  accessToken: string;
  driver: {
    id: string;
    tenantId: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    permissions: string[];
  };
}

const PIN_LENGTH = 6;

export default function DriverLoginPage(): JSX.Element {
  const router = useRouter();
  const setDriverSession = useAuthStore((state) => state.setDriverSession);
  const [documentOrPhone, setDocumentOrPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);

  useEffect(() => {
    if (pin.length === PIN_LENGTH && documentOrPhone.length >= 4 && !isSubmitting) {
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  async function submit(): Promise<void> {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiClient.post<DriverLoginResponse>("/auth/driver/login", {
        documentOrPhone,
        pin,
      });
      setDriverSession(result.accessToken, result.driver);
      router.push("/driver");
    } catch (err) {
      setPin("");
      if (err instanceof ApiError) {
        setError(err.response.message);
      } else {
        setError("No se pudo conectar con el servidor. Intenta de nuevo.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center gap-8 p-6">
      <Card>
        <CardHeader>
          <Logo size={44} className="mb-2" />
          <CardTitle className="text-lg font-semibold text-foreground">Ingreso de conductor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <label htmlFor="documentOrPhone" className="text-sm font-medium">
              Numero de documento
            </label>
            <input
              id="documentOrPhone"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={documentOrPhone}
              onChange={(event) => setDocumentOrPhone(event.target.value.trim())}
              className="w-full rounded-md border border-input bg-background px-3 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="1020304050"
            />
          </div>

          <div className="space-y-4">
            <p className="text-center text-sm font-medium text-muted-foreground">Ingresa tu PIN de 6 digitos</p>
            <PinDots value={pin} length={PIN_LENGTH} />
            {error && <p className="text-center text-sm text-destructive">{error}</p>}
            <NumericKeypad value={pin} maxLength={PIN_LENGTH} onChange={setPin} disabled={isSubmitting} />
          </div>

          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => setShowAgreement(true)}
          >
            {DRIVER_AGREEMENT.label}
          </button>
        </CardContent>
      </Card>

      <Dialog open={showAgreement} onOpenChange={setShowAgreement}>
        <DialogContent className="flex h-[90vh] w-full max-w-4xl flex-col">
          <DialogTitle>{DRIVER_AGREEMENT.label}</DialogTitle>
          <iframe
            src={DRIVER_AGREEMENT.href}
            title={DRIVER_AGREEMENT.label}
            className="h-full w-full flex-1 rounded-md border border-border"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
