import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calls, campaignRecipients, conversations, leads } from "@/db/schema";
import { getOrCreateConversation } from "@/lib/conversations";
import { forbidden, hangup, isValidTwilio, readTwilioForm } from "@/lib/voice/twiml";
import { agentTurn, loadCall } from "@/lib/voice/session";
import { realtimeEnabled, streamTwiml } from "@/lib/voice/stream-token";
import { startRecording } from "@/lib/voice/recording";

export async function POST(req: NextRequest) {
  const p = await readTwilioForm(req);
  const loaded = await loadCall({ id: req.nextUrl.searchParams.get("callId") });
  if (!loaded) return hangup();
  const { twilio, settings } = loaded;
  let { call } = loaded;
  if (!isValidTwilio(req, twilio.authToken, p)) return forbidden();

  if (p.AnsweredBy && /^(machine|fax)/.test(p.AnsweredBy)) {
    await db.update(calls).set({ callSid: p.CallSid, status: "voicemail" }).where(eq(calls.id, call.id));
    await db
      .update(campaignRecipients)
      .set({ status: "failed", error: "Voicemail / answering machine", updatedAt: new Date() })
      .where(and(eq(campaignRecipients.tenantId, call.tenantId), eq(campaignRecipients.externalId, p.CallSid)));
    return hangup();
  }

  const [lead] = call.leadId ? await db.select().from(leads).where(and(eq(leads.id, call.leadId), eq(leads.tenantId, call.tenantId))) : [];
  const conversation = await getOrCreateConversation({
    tenantId: call.tenantId,
    agentId: call.agentId,
    variables: call.variables,
    channel: "voice",
    externalId: p.CallSid,
    customerPhone: call.toNumber ?? undefined,
    customerName: lead?.name ?? undefined,
  });
  if (lead && !conversation.leadId) await db.update(conversations).set({ leadId: lead.id }).where(eq(conversations.id, conversation.id));
  [call] = await db.update(calls).set({ callSid: p.CallSid, status: "in-progress", conversationId: conversation.id }).where(eq(calls.id, call.id)).returning();

  startRecording(call.tenantId, call.id, p.CallSid);
  if (realtimeEnabled()) return streamTwiml(call.id, p.CallSid);
  return agentTurn({ call, settings, tenantNumber: twilio.phoneNumber });
}
