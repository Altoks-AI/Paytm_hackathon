"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/** Dashboard frame: fixed sidebar on desktop, top bar + slide-over menu on phones and tablets. */
export function Shell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  // The menu is "open on this page": navigating anywhere closes it without needing an effect.
  const path = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex min-h-screen flex-1 flex-col lg:flex-row">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:hidden">
        <span className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-zinc-900">AgentDesk</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100"
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </header>

      {open && <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-zinc-900/40 lg:hidden" />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] max-w-[85vw] flex-col overflow-y-auto border-r border-zinc-200 bg-zinc-50 px-3 py-5 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[232px] lg:shrink-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="absolute right-2 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 lg:hidden"
        >
          <X size={18} strokeWidth={1.75} aria-hidden />
        </button>
        {sidebar}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-[1080px]">{children}</div>
      </main>
    </div>
  );
}
