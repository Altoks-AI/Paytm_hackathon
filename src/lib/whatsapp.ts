import { getIntegration } from "@/lib/integrations";
import { GRAPH } from "@/lib/wa-templates";

type SendResult = { id?: string; error?: string };

async function send(tenantId: string, payload: Record<string, unknown>): Promise<SendResult> {
  try {
    const cfg = await getIntegration(tenantId, "meta_whatsapp");
    if (!cfg?.phoneNumberId || !cfg.accessToken) return { error: "WhatsApp is not connected" };
    const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
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

export async function sendWhatsAppText(tenantId: string, to: string, text: string): Promise<SendResult> {
  if (!text.trim()) return { error: "Empty message" };
  return send(tenantId, { ...address(to), type: "text", text: { preview_url: false, body: text.slice(0, 4096) } });
}

export async function sendWhatsAppTemplate(
  tenantId: string,
  to: string,
  template: { name: string; language: string; bodyParams: string[] }
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
  });
}
