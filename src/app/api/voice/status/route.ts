import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calls, campaignRecipients } from "@/db/schema";
import { forbidden, isValidTwilio, readTwilioForm } from "@/lib/voice/twiml";
import { loadCall } from "@/lib/voice/session";
import { maybeCompleteCampaign } from "@/lib/voice/outbound";
import { chargeCredits } from "@/lib/credits";

/** Twilio statusCallback (outbound calls set it automatically; point the number's status callback here for inbound). */
export async function POST(req: NextRequest) {
  const p = await readTwilioForm(req);
  const loaded = await loadCall({ id: req.nextUrl.searchParams.get("callId"), callSid: p.CallSid });
  if (!loaded) return new Response(null, { status: 204 });
  const { call, twilio } = loaded;
  if (!isValidTwilio(req, twilio.authToken, p)) return forbidden();

  const status = p.CallStatus || "completed";
  const durationSec = p.CallDuration ? Number(p.CallDuration) : null;
  await db
    .update(calls)
    .set({ status: call.status === "voicemail" ? "voicemail" : status, durationSec, ...(p.CallSid ? { callSid: p.CallSid } : {}) })
    .where(eq(calls.id, call.id));

  const terminal = ["completed", "busy", "no-answer", "failed", "canceled"].includes(status);
  // Bill the call once, per started minute (durationSec was null until this callback).
  if (terminal && durationSec && durationSec > 0 && call.durationSec == null) {
    await chargeCredits(call.tenantId, "voice_minute", { units: Math.ceil(durationSec / 60), note: `${call.direction} call ${call.toNumber ?? ""}`.trim(), allowNegative: true });
  }
  if (call.campaignId && terminal && p.CallSid) {
    const ok = status === "completed";
    await db
      .update(campaignRecipients)
      .set({ status: ok ? "completed" : "failed", error: ok ? null : status, updatedAt: new Date() })
      .where(and(eq(campaignRecipients.tenantId, call.tenantId), eq(campaignRecipients.externalId, p.CallSid), eq(campaignRecipients.status, "sent")));
    await maybeCompleteCampaign(call.tenantId, call.campaignId);
  }
  return new Response(null, { status: 204 });
}
