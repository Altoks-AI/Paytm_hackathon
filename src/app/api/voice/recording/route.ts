import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { forbidden, isValidTwilio, readTwilioForm } from "@/lib/voice/twiml";
import { loadCall } from "@/lib/voice/session";

/** Twilio recordingStatusCallback: store the finished recording on the call. */
export async function POST(req: NextRequest) {
  const p = await readTwilioForm(req);
  const loaded = await loadCall({ id: req.nextUrl.searchParams.get("callId"), callSid: p.CallSid });
  if (!loaded) return new Response(null, { status: 204 });
  if (!isValidTwilio(req, loaded.twilio.authToken, p)) return forbidden();
  if (p.RecordingStatus === "completed" && p.RecordingUrl) {
    await db
      .update(calls)
      .set({ recordingSid: p.RecordingSid || null, recordingUrl: p.RecordingUrl, recordingDurationSec: p.RecordingDuration ? Number(p.RecordingDuration) : null })
      .where(eq(calls.id, loaded.call.id));
  }
  return new Response(null, { status: 204 });
}
