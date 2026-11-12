import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { leads, waTemplates } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { Card } from "@/components/ui";
import { NOT_CONNECTED, metaConfig } from "../../_components/meta";
import { CampaignForm } from "./campaign-form";
import { listAgents } from "@/lib/agents";

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <NewCampaign />
    </Suspense>
  );
}

async function NewCampaign() {
  const { tenantId } = await requireTenant();
  const [templates, leadRows, cfg] = await Promise.all([
    db.select({ id: waTemplates.id, name: waTemplates.name, language: waTemplates.language, body: waTemplates.body, variables: waTemplates.variables })
      .from(waTemplates)
      .where(and(eq(waTemplates.tenantId, tenantId), eq(waTemplates.metaStatus, "APPROVED")))
      .orderBy(waTemplates.name),
    db.select({ id: leads.id, name: leads.name, phone: leads.phone, status: leads.status, tags: leads.tags })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), isNotNull(leads.phone)))
      .orderBy(desc(leads.createdAt))
      .limit(5000),
    metaConfig(tenantId),
  ]);
  return (
    <div className="space-y-4">
      {!cfg && <Card className="border-amber-200 bg-amber-50 text-sm text-amber-800">{NOT_CONNECTED} You can still create the campaign, but it can&apos;t be sent until connected.</Card>}
      {templates.length === 0 ? (
        <Card className="text-sm text-zinc-600">
          You need at least one <b>APPROVED</b> template. <Link href="/whatsapp/templates" className="font-medium text-zinc-900 underline">Create or sync templates</Link>.
        </Card>
      ) : (
        <CampaignForm templates={templates} leads={leadRows} senders={(await listAgents(tenantId)).filter((a) => a.whatsappPhoneNumberId).map((a) => ({ id: a.id, label: `${a.whatsappNumber || a.whatsappPhoneNumberId} · ${a.agentName}` }))} />
      )}
    </div>
  );
}
