"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HardHat, MapPin, Receipt, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OperationsQuickSetupWizard } from "@/components/admin/operations-quick-setup-wizard";
import ProjectsPage from "../projects/page";
import OperationalSitesPage from "../operational-sites/page";
import RatesPage from "../rates/page";

const TABS = [
  { value: "obras", label: "Obras", icon: HardHat },
  { value: "sitios", label: "Puntos operativos", icon: MapPin },
  { value: "tarifas", label: "Tarifas", icon: Receipt },
] as const;

type TabValue = (typeof TABS)[number]["value"];

// Modulo unico que agrupa Obras, Puntos operativos y Tarifas (antes tres
// paginas separadas) detras de pestañas — se pidio fusionarlos para
// simplificar la navegacion del dispatcher. Cada pestaña reutiliza el
// componente de pagina original sin cambios de logica, solo composicion.
function OperationsContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabValue) || "obras";
  const [wizardOpen, setWizardOpen] = useState(false);

  function selectTab(tab: TabValue): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    if (tab !== "sitios") params.delete("projectId");
    router.replace(`/operations?${params.toString()}`);
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex w-full min-w-0 flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => selectTab(tab.value)}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-base font-semibold transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setWizardOpen(true)}>
          <Sparkles className="h-4 w-4" />
          Añadir Obra
        </Button>
      </div>

      {activeTab === "obras" && <ProjectsPage />}
      {activeTab === "sitios" && <OperationalSitesPage />}
      {activeTab === "tarifas" && <RatesPage />}

      <OperationsQuickSetupWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => selectTab("obras")}
      />
    </div>
  );
}

export default function OperationsPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <OperationsContent />
    </Suspense>
  );
}
