"use client";

import { Logo } from "@/components/brand/logo";
import { NavLinks } from "./nav-links";

export function Sidebar(): JSX.Element {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-white/5 px-6">
        <Logo size={32} />
        <span className="text-base font-semibold tracking-tight">VALTIC</span>
      </div>
      <NavLinks />
    </aside>
  );
}
