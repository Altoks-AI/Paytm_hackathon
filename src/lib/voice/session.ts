import { eq } from "drizzle-orm";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { getAgentSettings } from "@/lib/tenant-data";
import { getIntegration } from "@/lib/integrations";
import { runAgent } from "@/lib/agent/run";
import type { RunAgentInput } from "@/lib/agent/types";
import { speakAndDial, speakAndHangup, speakAndListen, type VoiceCtx } from "./twiml";

export type CallRow = typeof calls.$inferSelect;

/** Load a call row with its tenant's Twilio credentials and agent settings. */
export async function loadCall(where: { id?: string | null; callSid?: string | null }) {
  const cond = where.id ? eq(calls.id, where.id) : where.callSid ? eq(calls.callSid, where.callSid) : null;
  if (!cond) return null;
  const [call] = await db.select().from(calls).where(cond);
  if (!call) return null;
  const [twilio, settings] = await Promise.all([getIntegration(call.tenantId, "twilio"), getAgentSettings(call.tenantId)]);
  if (!twilio) return null;
  return { call, twilio, settings };
}

export function voiceCtx(settings: { language: string; voice: string } | null): VoiceCtx {
  return { language: settings?.language || "en-IN", voice: settings?.voice || "" };
}

/** Run one agent turn and translate the result into TwiML (listen again / hang up / transfer). */
export async function agentTurn(opts: {
  call: CallRow;
  settings: Awaited<ReturnType<typeof getAgentSettings>>;
  tenantNumber: string;
  userMessage?: string;
  /** language detected for this turn (speak the reply in it) */
  language?: string;
}) {
  const { call, settings, tenantNumber } = opts;
  const ctx = { ...voiceCtx(settings), ...(opts.language ? { language: opts.language } : {}) };
  if (!call.conversationId) return speakAndHangup("Sorry, something went wrong. Goodbye.", ctx);
  const input: RunAgentInput = {
    tenantId: call.tenantId,
    conversationId: call.conversationId,
    channel: "voice",
    callDirection: call.direction === "outbound" ? "outbound" : "inbound",
    objective: call.objective ?? undefined,
    userMessage: opts.userMessage,
  };
  let result;
  try {
    result = await runAgent(input);
  } catch (e) {
    console.error("[voice] runAgent failed", e);
    return speakAndHangup("Sorry, I'm having trouble right now. Please try again later. Goodbye.", ctx);
  }
  if (result.handoff) {
    if (settings?.handoffPhone) return speakAndDial(result.reply || "Please hold while I connect you to a team member.", ctx, settings.handoffPhone, tenantNumber);
    return speakAndHangup(`${result.reply || ""} A member of our team will call you back shortly. Goodbye.`.trim(), ctx);
  }
  if (result.ended) return speakAndHangup(result.reply || "Thank you for calling. Goodbye.", ctx);
  return speakAndListen(result.reply, ctx, call.id);
}
