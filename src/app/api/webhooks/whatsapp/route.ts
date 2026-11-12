import { after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campaignRecipients, integrations } from "@/db/schema";
import { decryptJson } from "@/lib/crypto";
import { findTenantByLookup, type ProviderConfig } from "@/lib/integrations";
import { whatsappAgent } from "@/lib/agents";
import { getOrCreateConversation } from "@/lib/conversations";
import { runAgent } from "@/lib/agent/run";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { chargeCredits, hasCredits } from "@/lib/credits";
import { mediaToText, type WaMedia } from "@/lib/whatsapp-media";

type WaConfig = ProviderConfig["meta_whatsapp"];

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode !== "subscribe" || !token) return new Response("Forbidden", { status: 403 });
  const rows = await db.select().from(integrations).where(eq(integrations.provider, "meta_whatsapp"));
  for (const r of rows) {
    try {
      if (decryptJson<WaConfig>(r.configEncrypted).verifyToken === token) return new Response(challenge, { status: 200 });
    } catch {
      /* skip undecryptable rows */
    }
  }
  return new Response("Forbidden", { status: 403 });
}

// In-memory dedupe of processed message ids (Meta retries deliveries).
const g = globalThis as unknown as { __waSeen?: Map<string, number> };
const seen = (g.__waSeen ??= new Map<string, number>());
function firstTime(id: string) {
  if (seen.has(id)) return false;
  seen.set(id, Date.now());
  if (seen.size > 5000) for (const k of [...seen.keys()].slice(0, 1000)) seen.delete(k);
  return true;
}

function validSignature(raw: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

type WaMessage = {
  id: string;
  /** Phone number; omitted for users with a username whose number is unavailable. */
  from?: string;
  /** Business-scoped user ID (BSUID), always present. */
  from_user_id?: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  audio?: WaMedia;
  image?: WaMedia;
  document?: WaMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
};
type WaStatus = { id: string; status: string; errors?: { title?: string; message?: string }[] };
type WaValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; user_id?: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
};

/** Text for the agent. Voice notes go through Sarvam STT; images and PDFs are read by a vision LLM. */
async function messageText(m: WaMessage, tenantId: string, sttLanguage?: string) {
  if (m.type === "text") return m.text?.body ?? "";
  if (m.type === "button") return m.button?.text ?? "";
  if (m.type === "interactive") return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
  if (m.type === "audio" && m.audio) return mediaToText(tenantId, "audio", m.audio, sttLanguage);
  if (m.type === "image" && m.image) return mediaToText(tenantId, "image", m.image);
  if (m.type === "document" && m.document) return mediaToText(tenantId, "document", m.document);
  if (m.type === "location" && m.location) {
    const l = m.location;
    return `[The customer shared a location: ${[l.name, l.address].filter(Boolean).join(", ") || "pin"} (${l.latitude}, ${l.longitude})]`;
  }
  return `[The customer sent a ${m.type} message, which you cannot open. Ask them to describe it in text.]`;
}

async function handleValue(value: WaValue, raw: string, signature: string | null) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;
  const found = await findTenantByLookup("meta_whatsapp", phoneNumberId);
  if (!found) return;
  const { tenantId, config } = found;
  if (config.appSecret && !validSignature(raw, signature, config.appSecret)) {
    console.warn("whatsapp webhook: bad signature for tenant", tenantId);
    return;
  }

  for (const s of value.statuses ?? []) {
    const status = s.status === "delivered" || s.status === "read" ? "delivered" : s.status === "failed" ? "failed" : null;
    if (!status) continue;
    await db
      .update(campaignRecipients)
      .set({ status, error: status === "failed" ? s.errors?.[0]?.message || s.errors?.[0]?.title || "Delivery failed" : null, updatedAt: new Date() })
      .where(and(eq(campaignRecipients.tenantId, tenantId), eq(campaignRecipients.externalId, s.id), inArray(campaignRecipients.status, ["pending", "sent", "delivered"])));
  }

  if (!value.messages?.length) return;
  const settings = await whatsappAgent(tenantId);
  if (!settings) return;
  for (const m of value.messages) {
    if (!firstTime(m.id)) continue;
    // Multilingual agents: let Sarvam auto-detect the voice-note language.
    const text = (await messageText(m, tenantId, settings.extraLanguages.length ? undefined : settings.language)).trim();
    // Reply to the phone number when present, otherwise to the BSUID.
    const sender = m.from || m.from_user_id;
    if (!text || !sender) continue;
    const name = value.contacts?.find((c) => (m.from && c.wa_id === m.from) || (m.from_user_id && c.user_id === m.from_user_id))?.profile?.name;
    const conversation = await getOrCreateConversation({ tenantId, agentId: settings.id, channel: "whatsapp", externalId: sender, customerPhone: m.from ? `+${m.from}` : undefined, customerName: name });
    if (!(await hasCredits(tenantId, "whatsapp_message"))) {
      console.warn("whatsapp: tenant out of credits", tenantId);
      continue;
    }
    const { reply } = await runAgent({ tenantId, conversationId: conversation.id, channel: "whatsapp", userMessage: text });
    if (reply) {
      await chargeCredits(tenantId, "whatsapp_message", { note: `Reply to ${m.from ? `+${m.from}` : sender}`, allowNegative: true });
      const r = await sendWhatsAppText(tenantId, sender, reply);
      if (r.error) console.error("whatsapp send failed", tenantId, r.error);
    }
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  let body: { entry?: { changes?: { value?: WaValue }[] }[] } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200 });
  }
  after(async () => {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (!change.value) continue;
        try {
          await handleValue(change.value, raw, signature);
        } catch (e) {
          console.error("whatsapp webhook error", e);
        }
      }
    }
  });
  return new Response("ok", { status: 200 });
}
