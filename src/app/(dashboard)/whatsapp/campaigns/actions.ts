"use server";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { campaigns, campaignRecipients, leads, waTemplates } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { getAgent } from "@/lib/agents";
import { isUuid } from "@/lib/leads";
import { customLabels } from "@/lib/wa-templates";
import { isCampaignRunning, recipientCounts, runCampaign } from "@/lib/wa-campaigns";
import { NOT_CONNECTED, metaConfig } from "../_components/meta";

export type FormState = { error?: string } | undefined;

export async function createCampaign(_: FormState, fd: FormData): Promise<FormState> {
  const { tenantId } = await requireTenant();
  const name = String(fd.get("name") || "").trim();
  const templateId = String(fd.get("templateId") || "");
  const audience = fd.get("audience") === "selected" ? "selected" : "all";
  if (!name) return { error: "Campaign name is required" };
  if (!isUuid(templateId)) return { error: "Choose an approved template" };
  const [t] = await db.select().from(waTemplates).where(and(eq(waTemplates.id, templateId), eq(waTemplates.tenantId, tenantId)));
  if (!t || t.metaStatus !== "APPROVED") return { error: "Choose an approved template" };

  const customValues: Record<string, string> = {};
  for (const label of customLabels(t.variables)) {
    const v = String(fd.get(`custom:${label}`) || "").trim();
    if (!v) return { error: `Fill a value for "${label}"` };
    customValues[label] = v;
  }

  const base = and(eq(leads.tenantId, tenantId), isNotNull(leads.phone));
  let leadIds: string[];
  if (audience === "all") {
    leadIds = (await db.select({ id: leads.id }).from(leads).where(base)).map((l) => l.id);
  } else {
    const picked = [...new Set(fd.getAll("leadIds").map(String).filter(isUuid))];
    leadIds = [];
    for (let i = 0; i < picked.length; i += 1000) {
      const rows = await db.select({ id: leads.id }).from(leads).where(and(base, inArray(leads.id, picked.slice(i, i + 1000))));
      leadIds.push(...rows.map((l) => l.id));
    }
  }
  if (!leadIds.length) return { error: audience === "all" ? "You have no leads with a phone number yet" : "Select at least one lead" };

  const id = await db.transaction(async (tx) => {
    const [c] = await tx.insert(campaigns).values({ tenantId, agentId: (await getAgent(tenantId, String(fd.get("agentId") || "") || null))?.id ?? null, type: "whatsapp", name, templateId: t.id, customValues, audience }).returning({ id: campaigns.id });
    for (let i = 0; i < leadIds.length; i += 1000) {
      await tx.insert(campaignRecipients).values(leadIds.slice(i, i + 1000).map((leadId) => ({ tenantId, campaignId: c.id, leadId })));
    }
    return c.id;
  });
  revalidatePath("/whatsapp/campaigns");
  redirect(`/whatsapp/campaigns/${id}`);
}

/** Starts (or resumes) sending pending recipients in the background; returns immediately. */
export async function startCampaign(id: string) {
  const { tenantId } = await requireTenant();
  if (!isUuid(id)) return { error: "Invalid campaign" };
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId), eq(campaigns.type, "whatsapp")));
  if (!c) return { error: "Campaign not found" };
  if (isCampaignRunning(c.id)) return { error: "This campaign is already sending" };
  if (!(await metaConfig(tenantId))) return { error: NOT_CONNECTED };
  if (!c.templateId) return { error: "The template for this campaign was deleted" };
  const [t] = await db.select({ status: waTemplates.metaStatus }).from(waTemplates).where(and(eq(waTemplates.id, c.templateId), eq(waTemplates.tenantId, tenantId)));
  if (t?.status !== "APPROVED") return { error: `Template is not approved (status: ${t?.status ?? "missing"}). Sync template status and try again.` };
  const counts = await recipientCounts(tenantId, c.id);
  if (!counts.pending) return { error: "No pending recipients left to send" };

  await db.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, c.id));
  void runCampaign(tenantId, c.id); // long-lived Node server: keep sending after the response
  revalidatePath(`/whatsapp/campaigns/${c.id}`);
  revalidatePath("/whatsapp/campaigns");
  return { ok: `Sending to ${counts.pending} recipient${counts.pending === 1 ? "" : "s"}…` };
}

export async function deleteCampaign(id: string) {
  const { tenantId } = await requireTenant();
  if (!isUuid(id)) return { error: "Invalid campaign" };
  if (isCampaignRunning(id)) return { error: "Wait for sending to finish before deleting" };
  await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId), eq(campaigns.type, "whatsapp")));
  revalidatePath("/whatsapp/campaigns");
  redirect("/whatsapp/campaigns");
}
