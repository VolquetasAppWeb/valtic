"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";
import { NavLinks } from "./nav-links";

// Menu de navegacion para pantallas angostas (celular/tablet, <768px), donde
// el sidebar fijo (`Sidebar`, `hidden md:flex`) no se muestra. Sin esto no
// habia forma de navegar el panel por debajo de ese ancho.
export function MobileNav(): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent>
        <div className="flex h-16 items-center gap-2 border-b border-white/5 px-6">
          <Logo size={32} />
          <span className="text-base font-semibold tracking-tight">VALTIC</span>
        </div>
        <NavLinks onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
