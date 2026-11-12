import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { decryptJson } from "@/lib/crypto";
import { appUrl, requireTenant } from "@/lib/tenant";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PROVIDERS } from "./providers";
import { ProviderCard } from "./provider-card";
import { CopyField } from "./copy-field";
import { listAgents } from "@/lib/agents";
import { listTwilioNumbers } from "@/lib/voice/numbers";
import { listWhatsAppNumbers } from "@/lib/whatsapp-numbers";
import Link from "next/link";

function NumberList({ title, rows, error }: { title: string; rows: { number: string; label?: string; agent?: { id: string; name: string } }[]; error?: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-zinc-700">{title}</p>
      {error && <p className="mb-2 text-xs text-amber-700">Could not load numbers: {error}</p>}
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-400">No numbers found yet.</p>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {rows.map((r) => (
            <div key={r.number} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-mono text-zinc-900">{r.number}</span>
                {r.label && <span className="ml-2 text-xs text-zinc-500">{r.label}</span>}
              </span>
              {r.agent ? (
                <Link href={`/agent?agent=${r.agent.id}&tab=channels`} className="text-xs font-medium text-emerald-700 hover:underline">
                  Assigned to {r.agent.name}
                </Link>
              ) : (
                <Link href="/agent?tab=channels" className="text-xs text-zinc-500 underline">
                  Unassigned · assign to an agent
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const metadata: Metadata = { title: "Integrations" };

function readConfig(enc?: string): Record<string, string> {
  if (!enc) return {};
  try {
    return decryptJson<Record<string, string>>(enc);
  } catch {
    return {};
  }
}

export default async function IntegrationsPage() {
  const { tenantId } = await requireTenant();
  const rows = await db.select().from(integrations).where(eq(integrations.tenantId, tenantId));
  const base = appUrl();
  const [agentRows, tw, wa] = await Promise.all([listAgents(tenantId), listTwilioNumbers(tenantId), listWhatsAppNumbers(tenantId)]);
  const byPhone = new Map(agentRows.filter((a) => a.phoneNumber).map((a) => [a.phoneNumber as string, { id: a.id, name: a.agentName }]));
  const byWa = new Map(agentRows.filter((a) => a.whatsappPhoneNumberId).map((a) => [a.whatsappPhoneNumberId as string, { id: a.id, name: a.agentName }]));

  return (
    <>
      <PageHeader title="Integrations" description="Connect your own provider accounts. Credentials are encrypted at rest and secrets are never shown again after saving." />
      <div className="space-y-4">
        {PROVIDERS.map((def) => {
          const row = rows.find((r) => r.provider === def.id);
          const cfg = readConfig(row?.configEncrypted);
          const values: Record<string, string> = {};
          const savedSecrets: string[] = [];
          for (const f of def.fields) {
            if (!cfg[f.key]) continue;
            if (f.secret) savedSecrets.push(f.key);
            else values[f.key] = cfg[f.key];
          }
          return (
            <ProviderCard key={def.id} def={def} connected={!!row} enabled={!!row?.enabled} values={values} savedSecrets={savedSecrets}>
              {def.id === "meta_whatsapp" && (
                <>
                  {row && <NumberList title="Numbers in this WhatsApp Business Account" error={wa.error} rows={wa.numbers.map((n) => ({ number: n.display, label: n.name, agent: byWa.get(n.id) }))} />}
                  <p className="text-xs text-zinc-500">
                    In your Meta app <ChevronRight size={14} strokeWidth={2} aria-hidden className="inline-block align-[-2px] text-zinc-400" /> WhatsApp <ChevronRight size={14} strokeWidth={2} aria-hidden className="inline-block align-[-2px] text-zinc-400" /> Configuration <ChevronRight size={14} strokeWidth={2} aria-hidden className="inline-block align-[-2px] text-zinc-400" /> Webhook, paste these and subscribe to the <b>messages</b> field.
                  </p>
                  <CopyField label="Callback URL" value={`${base}/api/webhooks/whatsapp`} />
                  {values.verifyToken ? (
                    <CopyField label="Verify token" value={values.verifyToken} />
                  ) : (
                    <p className="text-xs text-zinc-400">The verify token appears here after you connect.</p>
                  )}
                </>
              )}
              {def.id === "twilio" && (
                <>
                  {row && <NumberList title="Numbers on this Twilio account" error={tw.error} rows={tw.numbers.map((n) => ({ number: n.phoneNumber, label: n.friendlyName !== n.phoneNumber ? n.friendlyName : undefined, agent: byPhone.get(n.phoneNumber) }))} />}
                  <p className="text-xs text-zinc-500">In Twilio <ChevronRight size={14} strokeWidth={2} aria-hidden className="inline-block align-[-2px] text-zinc-400" /> Phone Numbers <ChevronRight size={14} strokeWidth={2} aria-hidden className="inline-block align-[-2px] text-zinc-400" /> your number <ChevronRight size={14} strokeWidth={2} aria-hidden className="inline-block align-[-2px] text-zinc-400" /> Voice configuration, set &quot;A call comes in&quot; to this webhook. Numbers assigned to an agent are set up automatically.</p>
                  <CopyField label="Voice webhook URL" note="HTTP POST" value={`${base}/api/voice/incoming`} />
                </>
              )}
            </ProviderCard>
          );
        })}
      </div>
    </>
  );
}
