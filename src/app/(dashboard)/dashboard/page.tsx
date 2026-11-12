import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, calls, campaigns, conversations, handoffs, integrations, leads, socialPosts } from "@/db/schema";
import { getAgentSettings, requireTenant } from "@/lib/tenant";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PROVIDERS } from "../integrations/providers";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  const { tenant, tenantId } = await requireTenant();
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [leadCount, openConvs, pendingHandoffs, upcoming, callCount, campaignCount, postCount, settings, conns] = await Promise.all([
    n(db.select({ n: count() }).from(leads).where(eq(leads.tenantId, tenantId))),
    n(db.select({ n: count() }).from(conversations).where(and(eq(conversations.tenantId, tenantId), eq(conversations.status, "open")))),
    n(db.select({ n: count() }).from(handoffs).where(and(eq(handoffs.tenantId, tenantId), eq(handoffs.status, "pending")))),
    n(db.select({ n: count() }).from(appointments).where(and(eq(appointments.tenantId, tenantId), eq(appointments.status, "booked"), gt(appointments.startsAt, sql`now()`)))),
    n(db.select({ n: count() }).from(calls).where(eq(calls.tenantId, tenantId))),
    n(db.select({ n: count() }).from(campaigns).where(eq(campaigns.tenantId, tenantId))),
    n(db.select({ n: count() }).from(socialPosts).where(eq(socialPosts.tenantId, tenantId))),
    getAgentSettings(tenantId),
    db.select({ provider: integrations.provider, enabled: integrations.enabled }).from(integrations).where(eq(integrations.tenantId, tenantId)),
  ]);

  const stats: [string, number, string][] = [
    ["Leads", leadCount, "/leads"],
    ["Open conversations", openConvs, "/conversations"],
    ["Pending handoffs", pendingHandoffs, "/handoffs"],
    ["Upcoming appointments", upcoming, "/appointments"],
    ["Calls", callCount, "/calls"],
    ["Campaigns", campaignCount, "/whatsapp"],
    ["Social posts", postCount, "/social"],
  ];
  const conn = new Map(conns.map((c) => [c.provider, c.enabled]));
  const channels: [string, boolean | undefined, string][] = [
    ["WhatsApp", settings?.whatsappEnabled, conn.get("meta_whatsapp") ? "" : "Needs Meta WhatsApp integration"],
    ["Voice calls", settings?.voiceEnabled, conn.get("twilio") ? "" : "Needs Twilio integration"],
    ["Chatbot widget", settings?.chatbotEnabled, ""],
  ];

  return (
    <>
      <PageHeader title={`Welcome, ${tenant.name}`} description="A snapshot of your AI agent and customer activity." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {stats.map(([label, value, href]) => (
          <Link key={label} href={href} className="min-w-0 rounded-[10px] border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 sm:p-5">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium text-zinc-900">Channels</h2>
            <Link href="/agent" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">Configure <ChevronRight size={14} strokeWidth={2} aria-hidden /></Link>
          </div>
          <ul className="divide-y divide-zinc-100">
            {channels.map(([name, on, note]) => (
              <li key={name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  {name}
                  {note && <span className="ml-2 text-xs text-zinc-400">{note}</span>}
                </span>
                <Badge tone={on ? "green" : "zinc"}>{on ? "Enabled" : "Disabled"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium text-zinc-900">Integrations</h2>
            <Link href="/integrations" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">Manage <ChevronRight size={14} strokeWidth={2} aria-hidden /></Link>
          </div>
          <ul className="divide-y divide-zinc-100">
            {PROVIDERS.map((p) => {
              const state = conn.get(p.id);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/integrations#${p.id}`} className="flex items-center gap-2 hover:underline">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${state ? "bg-brand-600 text-white" : "border border-zinc-300"}`}>{state && <Check size={10} strokeWidth={2.5} aria-hidden />}</span>
                    {p.name}
                  </Link>
                  <Badge tone={state ? "green" : state === false ? "amber" : "zinc"}>{state ? "Connected" : state === false ? "Disabled" : "Not connected"}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
