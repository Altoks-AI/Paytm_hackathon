"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/whatsapp/templates", label: "Templates" },
  { href: "/whatsapp/campaigns", label: "Campaigns" },
];

export function Tabs() {
  const path = usePathname();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200">
      {tabs.map((t) => {
        const active = path.startsWith(t.href) || (path === "/whatsapp" && t.href === "/whatsapp/templates");
        return (
          <Link key={t.href} href={t.href} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
