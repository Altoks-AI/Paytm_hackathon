import { getIntegration } from "@/lib/integrations";
import { GRAPH } from "@/lib/wa-templates";

type SendResult = { id?: string; error?: string };

async function send(tenantId: string, payload: Record<string, unknown>, fromId?: string | null): Promise<SendResult> {
  try {
    const cfg = await getIntegration(tenantId, "meta_whatsapp");
    if (!cfg?.phoneNumberId || !cfg.accessToken) return { error: "WhatsApp is not connected" };
    const res = await fetch(`${GRAPH}/${fromId || cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error?.message || `WhatsApp API error ${res.status}` };
    return { id: data?.messages?.[0]?.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "WhatsApp send failed" };
  }
}

/** Meta wants numbers without "+" or spaces. */
const normalize = (to: string) => to.replace(/[^\d]/g, "");
/** Users who adopted a WhatsApp username may arrive with only a business-scoped user ID (e.g. "US.1349…"), addressed via `recipient`. */
const address = (to: string) => (/^[A-Z]{2}\./.test(to) ? { recipient: to } : { to: normalize(to) });

/** `fromId`: Meta phone number ID to send from (an agent's number); defaults to the integration's number. */
export async function sendWhatsAppText(tenantId: string, to: string, text: string, fromId?: string | null): Promise<SendResult> {
  if (!text.trim()) return { error: "Empty message" };
  return send(tenantId, { ...address(to), type: "text", text: { preview_url: false, body: text.slice(0, 4096) } }, fromId);
}

export async function sendWhatsAppTemplate(
  tenantId: string,
  to: string,
  template: { name: string; language: string; bodyParams: string[] },
  fromId?: string | null
): Promise<SendResult> {
  return send(tenantId, {
    to: normalize(to),
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components: template.bodyParams.length
        ? [{ type: "body", parameters: template.bodyParams.map((t) => ({ type: "text", text: t || "-" })) }]
        : undefined,
    },
  }, fromId);
}

/** Marks an incoming message as read (blue ticks) and shows "typing…" until we reply (max ~25s). */
export async function markReadAndTyping(tenantId: string, messageId: string, fromId?: string | null): Promise<void> {
  try {
    const cfg = await getIntegration(tenantId, "meta_whatsapp");
    if (!cfg?.phoneNumberId || !cfg.accessToken) return;
    const res = await fetch(`${GRAPH}/${fromId || cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" } }),
    });
    if (!res.ok) console.warn("whatsapp mark-read failed", await res.text().catch(() => res.status));
  } catch (e) {
    console.warn("whatsapp mark-read failed", e);
  }
}
