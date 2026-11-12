import twilio from "twilio";
import { getIntegration } from "@/lib/integrations";
import { appUrl } from "@/lib/tenant-data";

export type TwilioNumber = { phoneNumber: string; friendlyName: string; sid?: string };

/** Voice-capable numbers on the tenant's Twilio account (plus the number saved on the integration). Empty if not connected. */
export async function listTwilioNumbers(tenantId: string): Promise<{ numbers: TwilioNumber[]; error?: string }> {
  const cfg = await getIntegration(tenantId, "twilio");
  if (!cfg) return { numbers: [] };
  const out = new Map<string, TwilioNumber>();
  let error: string | undefined;
  try {
    const list = await twilio(cfg.accountSid, cfg.authToken).incomingPhoneNumbers.list({ limit: 100 });
    for (const n of list) if (n.capabilities?.voice !== false) out.set(n.phoneNumber, { phoneNumber: n.phoneNumber, friendlyName: n.friendlyName, sid: n.sid });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (cfg.phoneNumber && !out.has(cfg.phoneNumber)) out.set(cfg.phoneNumber, { phoneNumber: cfg.phoneNumber, friendlyName: cfg.phoneNumber });
  return { numbers: [...out.values()], error };
}

/** Point a Twilio number's "A call comes in" webhook at this app (best effort; needs a public https APP_URL). */
export async function configureNumberWebhook(tenantId: string, phoneNumber: string): Promise<string | null> {
  const base = appUrl();
  if (!base.startsWith("https://")) return "APP_URL is not a public https address, so the number's webhook was not set automatically.";
  const cfg = await getIntegration(tenantId, "twilio");
  if (!cfg) return "Twilio is not connected.";
  try {
    const client = twilio(cfg.accountSid, cfg.authToken);
    const [n] = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
    if (!n) return "Number not found on your Twilio account, so its webhook was not set automatically.";
    await client.incomingPhoneNumbers(n.sid).update({ voiceUrl: `${base}/api/voice/incoming`, voiceMethod: "POST" });
    return null;
  } catch (e) {
    return `Could not set the number's webhook automatically: ${e instanceof Error ? e.message : String(e)}`;
  }
}
