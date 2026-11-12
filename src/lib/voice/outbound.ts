import { randomUUID } from "crypto";
import twilio from "twilio";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { calls, campaigns, campaignRecipients, leads } from "@/db/schema";
import { appUrl, getAgentSettings } from "@/lib/tenant-data";
import { getIntegration } from "@/lib/integrations";
import { hasCredits, OUT_OF_CREDITS } from "@/lib/credits";

/** Throws a user-facing error if the tenant can't place calls. Returns Twilio config. */
export async function assertVoiceReady(tenantId: string) {
  const [cfg, settings] = await Promise.all([getIntegration(tenantId, "twilio"), getAgentSettings(tenantId)]);
  if (!cfg) throw new Error("Twilio is not connected. Connect it in Integrations first.");
  if (!settings?.voiceEnabled) throw new Error("Voice is disabled. Enable the voice channel in Agent settings first.");
  if (!(await hasCredits(tenantId, "voice_minute"))) throw new Error(OUT_OF_CREDITS);
  return cfg;
}

export async function startOutboundCall(opts: { tenantId: string; to: string; leadId?: string; campaignId?: string; objective: string }) {
  const cfg = await assertVoiceReady(opts.tenantId);
  const to = opts.to.replace(/[^\d+]/g, "");
  if (!/^\+\d{8,15}$/.test(to)) throw new Error(`Invalid phone number "${opts.to}" (use E.164, e.g. +919876543210)`);

  // Insert first so the answer webhook can find the row by id even if it arrives before calls.create returns.
  const [row] = await db
    .insert(calls)
    .values({
      tenantId: opts.tenantId,
      callSid: `pending-${randomUUID()}`,
      direction: "outbound",
      fromNumber: cfg.phoneNumber,
      toNumber: to,
      status: "queued",
      campaignId: opts.campaignId ?? null,
      leadId: opts.leadId ?? null,
      objective: opts.objective,
    })
    .returning();
  try {
    const q = `callId=${encodeURIComponent(row.id)}`;
    const call = await twilio(cfg.accountSid, cfg.authToken).calls.create({
      to,
      from: cfg.phoneNumber,
      url: `${appUrl()}/api/voice/outbound-answer?${q}`,
      method: "POST",
      statusCallback: `${appUrl()}/api/voice/status?${q}`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["completed"],
      machineDetection: "Enable",
      timeout: 30,
    });
    await db.update(calls).set({ callSid: call.sid }).where(eq(calls.id, row.id));
    return { callId: row.id, callSid: call.sid };
  } catch (e) {
    await db.update(calls).set({ status: "failed" }).where(eq(calls.id, row.id));
    throw e;
  }
}

// ---- Call campaigns ----

const MAX_IN_FLIGHT = 3;
const g = globalThis as unknown as { __callCampaignsRunning?: Set<string> };
const running = (g.__callCampaignsRunning ??= new Set<string>());

export const isCampaignRunning = (campaignId: string) => running.has(campaignId);

/** Mark the campaign completed when no recipient is pending or in a live call. */
export async function maybeCompleteCampaign(tenantId: string, campaignId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaignRecipients)
    .where(and(eq(campaignRecipients.tenantId, tenantId), eq(campaignRecipients.campaignId, campaignId), inArray(campaignRecipients.status, ["pending", "sent"])));
  if (n === 0) await db.update(campaigns).set({ status: "completed" }).where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)));
}

/** Dials pending recipients with at most MAX_IN_FLIGHT live calls. Runs in the background (long-lived server). */
export async function runCallCampaign(tenantId: string, campaignId: string) {
  if (running.has(campaignId)) return;
  running.add(campaignId);
  try {
    const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId), eq(campaigns.type, "call")));
    if (!campaign) return;
    await db.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, campaignId));
    const deadline = Date.now() + 6 * 60 * 60 * 1000;
    while (Date.now() < deadline) {
      const [cur] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId));
      if (!cur || cur.status !== "running") break; // paused/stopped
      const [{ live }] = await db
        .select({ live: sql<number>`count(*)::int` })
        .from(campaignRecipients)
        .where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "sent")));
      if (live >= MAX_IN_FLIGHT) {
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      const [next] = await db
        .select({ id: campaignRecipients.id, leadId: campaignRecipients.leadId, phone: leads.phone })
        .from(campaignRecipients)
        .innerJoin(leads, eq(leads.id, campaignRecipients.leadId))
        .where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.tenantId, tenantId), eq(campaignRecipients.status, "pending")))
        .limit(1);
      if (!next) break;
      try {
        if (!next.phone) throw new Error("Lead has no phone number");
        const { callId, callSid } = await startOutboundCall({ tenantId, to: next.phone, leadId: next.leadId, campaignId, objective: campaign.callObjective || "Introduce our company and help the customer." });
        await db.update(campaignRecipients).set({ status: "sent", externalId: callSid, error: null, updatedAt: new Date() }).where(eq(campaignRecipients.id, next.id));
        // A very fast terminal status callback may have arrived before the recipient was marked "sent".
        const [c] = await db.select({ status: calls.status }).from(calls).where(eq(calls.id, callId));
        if (c && ["completed", "busy", "no-answer", "failed", "canceled", "voicemail"].includes(c.status)) {
          const ok = c.status === "completed";
          await db.update(campaignRecipients).set({ status: ok ? "completed" : "failed", error: ok ? null : c.status }).where(and(eq(campaignRecipients.id, next.id), eq(campaignRecipients.status, "sent")));
        }
      } catch (e) {
        await db.update(campaignRecipients).set({ status: "failed", error: e instanceof Error ? e.message : String(e), updatedAt: new Date() }).where(eq(campaignRecipients.id, next.id));
        if (e instanceof Error && /not connected|disabled/.test(e.message)) {
          await db.update(campaigns).set({ status: "failed" }).where(eq(campaigns.id, campaignId));
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    await maybeCompleteCampaign(tenantId, campaignId);
  } catch (e) {
    console.error("[voice] campaign runner failed", e);
  } finally {
    running.delete(campaignId);
  }
}
