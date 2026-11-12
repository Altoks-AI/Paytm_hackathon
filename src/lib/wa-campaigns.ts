import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignRecipients, leads, waTemplates } from "@/db/schema";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { getAgent } from "@/lib/agents";
import { resolveParams } from "@/lib/wa-templates";
import { addCredits, chargeCredits, CREDIT_COSTS } from "@/lib/credits";

const CONCURRENCY = 5;
const BATCH = 50;
const g = globalThis as unknown as { __waRunning?: Set<string> };
const running = (g.__waRunning ??= new Set<string>());

export const isCampaignRunning = (campaignId: string) => running.has(campaignId);

export async function recipientCounts(tenantId: string, campaignId: string) {
  const rows = await db
    .select({ status: campaignRecipients.status, n: sql<number>`count(*)::int` })
    .from(campaignRecipients)
    .where(and(eq(campaignRecipients.tenantId, tenantId), eq(campaignRecipients.campaignId, campaignId)))
    .groupBy(campaignRecipients.status);
  const c = { pending: 0, sent: 0, delivered: 0, failed: 0, total: 0 } as Record<string, number>;
  for (const r of rows) { c[r.status] = (c[r.status] ?? 0) + r.n; c.total += r.n; }
  return c as { pending: number; sent: number; delivered: number; failed: number; total: number };
}

/** Sends all pending recipients of a WhatsApp campaign. Resumable; safe to fire-and-forget (never throws). */
export async function runCampaign(tenantId: string, campaignId: string) {
  if (running.has(campaignId)) return;
  running.add(campaignId);
  try {
    const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId), eq(campaigns.type, "whatsapp")));
    if (!c?.templateId) throw new Error("Campaign or template not found");
    const [t] = await db.select().from(waTemplates).where(and(eq(waTemplates.id, c.templateId), eq(waTemplates.tenantId, tenantId)));
    if (!t) throw new Error("Template not found");
    const fromId = c.agentId ? (await getAgent(tenantId, c.agentId))?.whatsappPhoneNumberId : null;
    await db.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, c.id));

    for (;;) {
      const batch = await db
        .select({ id: campaignRecipients.id, name: leads.name, phone: leads.phone, email: leads.email })
        .from(campaignRecipients)
        .innerJoin(leads, eq(leads.id, campaignRecipients.leadId))
        .where(and(eq(campaignRecipients.tenantId, tenantId), eq(campaignRecipients.campaignId, c.id), eq(campaignRecipients.status, "pending")))
        .limit(BATCH);
      if (!batch.length) break;
      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        await Promise.all(
          batch.slice(i, i + CONCURRENCY).map(async (r) => {
            let res: { id?: string; error?: string };
            if (!r.phone) res = { error: "Lead has no phone number" };
            else if (!(await chargeCredits(tenantId, "whatsapp_template", { note: c.name }))) res = { error: "Out of credits" };
            else {
              try {
                res = await sendWhatsAppTemplate(tenantId, r.phone, { name: t.name, language: t.language, bodyParams: resolveParams(t.variables, r, c.customValues) }, fromId);
              } catch (e) {
                res = { error: (e as Error).message || "Send failed" };
              }
              if (res.error || !res.id) await addCredits(tenantId, CREDIT_COSTS.whatsapp_template.cost, "refund", "Campaign message failed to send");
            }
            await db
              .update(campaignRecipients)
              .set(res.id && !res.error ? { status: "sent", externalId: res.id, error: null, updatedAt: new Date() } : { status: "failed", error: res.error || "Unknown error", updatedAt: new Date() })
              .where(eq(campaignRecipients.id, r.id));
          })
        );
      }
    }
    await db.update(campaigns).set({ status: "completed" }).where(eq(campaigns.id, c.id));
  } catch (e) {
    console.error("[wa-campaign]", campaignId, e);
    await db.update(campaigns).set({ status: "failed" }).where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId))).catch(() => {});
  } finally {
    running.delete(campaignId);
  }
}
