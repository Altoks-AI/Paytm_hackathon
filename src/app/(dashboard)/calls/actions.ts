"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignRecipients, leads } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { assertVoiceReady, isCampaignRunning, runCallCampaign, startOutboundCall } from "@/lib/voice/outbound";

export type FormState = { error?: string; ok?: string } | null;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function callNow(_: FormState, fd: FormData): Promise<FormState> {
  const { tenantId } = await requireTenant();
  const to = String(fd.get("to") || "").trim();
  const objective = String(fd.get("objective") || "").trim() || "Introduce our company and ask how we can help.";
  if (!to) return { error: "Enter a phone number." };
  try {
    const [lead] = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.tenantId, tenantId), eq(leads.phone, to.replace(/[^\d+]/g, ""))));
    await startOutboundCall({ tenantId, to, objective, leadId: lead?.id });
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath("/calls");
  return { ok: `Calling ${to}…` };
}

export async function createCallCampaign(_: FormState, fd: FormData): Promise<FormState> {
  const { tenantId } = await requireTenant();
  const name = String(fd.get("name") || "").trim();
  const objective = String(fd.get("objective") || "").trim();
  const audience = fd.get("audience") === "selected" ? "selected" : "all";
  if (!name || !objective) return { error: "Name and objective are required." };

  const base = and(eq(leads.tenantId, tenantId), isNotNull(leads.phone), ne(leads.phone, ""));
  let leadIds: string[];
  if (audience === "all") {
    leadIds = (await db.select({ id: leads.id }).from(leads).where(base)).map((l) => l.id);
  } else {
    const picked = fd.getAll("leadIds").map(String).filter(Boolean);
    leadIds = picked.length ? (await db.select({ id: leads.id }).from(leads).where(and(base, inArray(leads.id, picked)))).map((l) => l.id) : [];
  }
  if (!leadIds.length) return { error: "No leads with a phone number in this audience." };

  const id = await db.transaction(async (tx) => {
    const [c] = await tx.insert(campaigns).values({ tenantId, type: "call", name, callObjective: objective, audience }).returning({ id: campaigns.id });
    await tx.insert(campaignRecipients).values(leadIds.map((leadId) => ({ tenantId, campaignId: c.id, leadId })));
    return c.id;
  });
  revalidatePath("/calls");
  redirect(`/calls/campaigns/${id}`);
}

async function ownCampaign(tenantId: string, id: string) {
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId), eq(campaigns.type, "call")));
  return c ?? null;
}

/** Start or continue: dials remaining pending recipients in the background with a small concurrency cap. */
export async function startCallCampaign(_: FormState, fd: FormData): Promise<FormState> {
  const { tenantId } = await requireTenant();
  const id = String(fd.get("campaignId") || "");
  const c = await ownCampaign(tenantId, id);
  if (!c) return { error: "Campaign not found." };
  try {
    await assertVoiceReady(tenantId);
  } catch (e) {
    return { error: msg(e) };
  }
  if (isCampaignRunning(id)) {
    await db.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, id));
    revalidatePath(`/calls/campaigns/${id}`);
    return { ok: "Campaign is already dialing." };
  }
  const pending = await db
    .select({ id: campaignRecipients.id })
    .from(campaignRecipients)
    .where(and(eq(campaignRecipients.campaignId, id), eq(campaignRecipients.tenantId, tenantId), eq(campaignRecipients.status, "pending")))
    .limit(1);
  if (!pending.length) return { error: "No pending recipients left to call." };
  await db.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, id));
  void runCallCampaign(tenantId, id); // long-lived Node server: continue after responding
  revalidatePath(`/calls/campaigns/${id}`);
  revalidatePath("/calls");
  return { ok: "Campaign started. Refresh to see progress." };
}

export async function pauseCallCampaign(_: FormState, fd: FormData): Promise<FormState> {
  const { tenantId } = await requireTenant();
  const id = String(fd.get("campaignId") || "");
  const c = await ownCampaign(tenantId, id);
  if (!c) return { error: "Campaign not found." };
  await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, id));
  revalidatePath(`/calls/campaigns/${id}`);
  return { ok: "Paused. Calls already in progress will finish." };
}

/** Reset failed recipients to pending so "Start" dials them again. */
export async function retryFailed(_: FormState, fd: FormData): Promise<FormState> {
  const { tenantId } = await requireTenant();
  const id = String(fd.get("campaignId") || "");
  const c = await ownCampaign(tenantId, id);
  if (!c) return { error: "Campaign not found." };
  await db
    .update(campaignRecipients)
    .set({ status: "pending", error: null, externalId: null, updatedAt: new Date() })
    .where(and(eq(campaignRecipients.campaignId, id), eq(campaignRecipients.tenantId, tenantId), eq(campaignRecipients.status, "failed")));
  revalidatePath(`/calls/campaigns/${id}`);
  return { ok: "Failed recipients reset to pending." };
}
