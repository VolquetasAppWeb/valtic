"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
  destructive?: boolean;
}

// Reemplaza la fila de botones-icono-solo ("qué significa cada emoji?") por
// un unico boton con texto ("Acciones") que despliega cada opcion tambien
// con su nombre en texto — pensado para usuarios mayores que no reconocen
// iconos sueltos. Se usa igual en la tabla de escritorio y en las tarjetas
// de celular/tablet.
export function RowActionsMenu({ actions, label = "Acciones" }: { actions: RowAction[]; label?: string }): JSX.Element {
  const visible = actions.filter((a) => !a.hidden);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {label}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visible.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.disabled}
            onClick={action.onClick}
            className={cn(action.destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive")}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
