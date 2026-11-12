import { getIntegration } from "@/lib/integrations";

export const NOT_CONNECTED = "WhatsApp is not connected. Add your Meta WhatsApp credentials (phone number ID, WABA ID, access token) in Integrations first.";

export async function metaConfig(tenantId: string) {
  const cfg = await getIntegration(tenantId, "meta_whatsapp");
  return cfg?.wabaId && cfg.accessToken ? cfg : null;
}
