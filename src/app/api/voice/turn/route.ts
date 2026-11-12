import type { NextRequest } from "next/server";
import { transcribe } from "@/lib/sarvam";
import { forbidden, hangup, isValidTwilio, readTwilioForm, speakAndHangup, speakAndListen } from "@/lib/voice/twiml";
import { agentTurn, loadCall, voiceCtx } from "@/lib/voice/session";

const MAX_EMPTY = 3; // re-prompt twice, then hang up

async function downloadRecording(url: string, sid: string, token: string): Promise<Buffer | null> {
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${url}.wav`, { headers: { Authorization: auth } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 404) break;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return null;
}

export async function POST(req: NextRequest) {
  const p = await readTwilioForm(req);
  const loaded = await loadCall({ id: req.nextUrl.searchParams.get("callId"), callSid: p.CallSid });
  if (!loaded) return hangup();
  const { call, twilio, settings } = loaded;
  if (!isValidTwilio(req, twilio.authToken, p) || (p.CallSid && p.CallSid !== call.callSid)) return forbidden();
  const ctx = voiceCtx(settings);

  // Multilingual agents: let Sarvam auto-detect, then speak back in the detected language if it's allowed.
  const allowed = [settings?.language || "en-IN", ...(settings?.extraLanguages ?? [])];
  let language: string | undefined;
  let transcript = "";
  if (p.RecordingUrl && Number(p.RecordingDuration || "1") > 0) {
    try {
      const audio = await downloadRecording(p.RecordingUrl, twilio.accountSid, twilio.authToken);
      if (audio) {
        const r = await transcribe(audio, "audio/wav", allowed.length > 1 ? undefined : allowed[0]);
        transcript = r.transcript;
        if (r.language && allowed.includes(r.language)) language = r.language;
      }
    } catch (e) {
      console.error("[voice] STT failed", e);
    }
  }

  if (!transcript) {
    const empty = Number(req.nextUrl.searchParams.get("e") || "0");
    if (empty >= MAX_EMPTY) return speakAndHangup("I couldn't hear anything, so I'll end the call now. Feel free to call again. Goodbye.", ctx);
    return speakAndListen("Sorry, I didn't catch that. Could you please repeat?", ctx, call.id, empty);
  }

  return agentTurn({ call, settings, tenantNumber: twilio.phoneNumber, userMessage: transcript, language });
}
