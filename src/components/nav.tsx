"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, MessagesSquare, Headset, CalendarCheck, Users, Send, PhoneOutgoing, Share2, Images, Bot, Plug, Building2, CreditCard, BookOpen, type LucideIcon } from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; badge?: "handoffs" };

// Grouped by what the person is doing, not by feature.
const groups: { title?: string; items: Item[] }[] = [
  { items: [{ href: "/dashboard", label: "Overview", icon: LayoutGrid }] },
  {
    title: "Customers",
    items: [
      { href: "/conversations", label: "Conversations", icon: MessagesSquare },
      { href: "/handoffs", label: "Handoffs", icon: Headset, badge: "handoffs" },
      { href: "/appointments", label: "Appointments", icon: CalendarCheck },
      { href: "/leads", label: "Leads", icon: Users },
    ],
  },
  {
    title: "Outreach",
    items: [
      { href: "/whatsapp", label: "WhatsApp campaigns", icon: Send },
      { href: "/calls", label: "Call campaigns", icon: PhoneOutgoing },
      { href: "/social", label: "Social posts", icon: Share2 },
      { href: "/media", label: "Media library", icon: Images },
    ],
  },
  {
    title: "Setup",
    items: [
      { href: "/agent", label: "Agent", icon: Bot },
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Company", icon: Building2 },
      { href: "/billing", label: "Billing and credits", icon: CreditCard },
      { href: "/documentation", label: "Documentation", icon: BookOpen },
    ],
  },
];

export function Nav({ pendingHandoffs = 0 }: { pendingHandoffs?: number }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <p className="mb-1 px-2.5 text-xs font-medium text-zinc-400">{g.title}</p>}
          <div className="flex flex-col gap-px">
            {g.items.map((i) => {
              const active = path === i.href || path.startsWith(`${i.href}/`);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors lg:py-1.5 ${
                    active ? "bg-white font-medium text-zinc-900 ring-1 ring-zinc-200" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <i.icon size={16} strokeWidth={1.75} className={active ? "text-brand-600" : "text-zinc-400"} aria-hidden />
                    <span className="truncate">{i.label}</span>
                  </span>
                  {i.badge === "handoffs" && pendingHandoffs > 0 && (
                    <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">{pendingHandoffs}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
