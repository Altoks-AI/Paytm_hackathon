import twilio from "twilio";
import { getIntegration } from "@/lib/integrations";
import { appUrl } from "@/lib/tenant-data";

/**
 * Start a dual-channel recording of a live call (caller + agent on separate channels).
 * Called right after we answer the webhook, so it retries briefly until Twilio reports the call as in progress.
 * Twilio posts the finished recording to /api/voice/recording.
 */
export function startRecording(tenantId: string, callId: string, callSid: string) {
  if (!callSid || callSid.startsWith("pending-")) return;
  void (async () => {
    const cfg = await getIntegration(tenantId, "twilio");
    if (!cfg) return;
    const client = twilio(cfg.accountSid, cfg.authToken);
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      try {
        await client.calls(callSid).recordings.create({
          recordingChannels: "dual",
          recordingStatusCallback: `${appUrl()}/api/voice/recording?callId=${encodeURIComponent(callId)}`,
          recordingStatusCallbackMethod: "POST",
          recordingStatusCallbackEvent: ["completed"],
        });
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Call already finished or not yet in progress: retry only the latter.
        if (/not in-progress|not eligible|21220/i.test(msg) && attempt < 3) continue;
        console.error("[voice] could not start recording", callSid, msg);
        return;
      }
    }
  })();
}
