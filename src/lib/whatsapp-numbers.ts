import { getIntegration } from "@/lib/integrations";
import { GRAPH } from "@/lib/wa-templates";

export type WaNumber = { id: string; display: string; name?: string };

/** Phone numbers in the tenant's WhatsApp Business Account (plus the default number saved on the integration). */
export async function listWhatsAppNumbers(tenantId: string): Promise<{ numbers: WaNumber[]; error?: string }> {
  const cfg = await getIntegration(tenantId, "meta_whatsapp");
  if (!cfg) return { numbers: [] };
  const out = new Map<string, WaNumber>();
  let error: string | undefined;
  if (cfg.wabaId && cfg.accessToken) {
    try {
      const res = await fetch(`${GRAPH}/${encodeURIComponent(cfg.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`, {
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { data?: { id: string; display_phone_number?: string; verified_name?: string }[]; error?: { message?: string } };
      if (!res.ok) throw new Error(data.error?.message || `WhatsApp API error ${res.status}`);
      for (const n of data.data ?? []) out.set(n.id, { id: n.id, display: n.display_phone_number || n.id, name: n.verified_name });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  if (cfg.phoneNumberId && !out.has(cfg.phoneNumberId)) out.set(cfg.phoneNumberId, { id: cfg.phoneNumberId, display: `ID ${cfg.phoneNumberId}` });
  return { numbers: [...out.values()], error };
}
