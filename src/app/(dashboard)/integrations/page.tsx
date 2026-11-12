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
                  <p className="text-xs text-zinc-500">In Twilio <ChevronRight size={14} strokeWidth={2} aria-hidden className="inline-block align-[-2px] text-zinc-400" /> Phone Numbers <ChevronRight size={14} strokeWidth={2} aria-hidden className="inline-block align-[-2px] text-zinc-400" /> your number <ChevronRight size={14} strokeWidth={2} aria-hidden className="inline-block align-[-2px] text-zinc-400" /> Voice configuration, set &quot;A call comes in&quot; to this webhook.</p>
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
