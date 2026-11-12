import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrations, type Provider } from "@/db/schema";
import { encryptJson, decryptJson } from "./crypto";

export type ProviderConfig = {
  meta_whatsapp: { phoneNumberId: string; wabaId: string; accessToken: string; verifyToken: string; appSecret?: string };
  twilio: { accountSid: string; authToken: string; phoneNumber: string };
  linkedin: { accessToken: string; authorUrn: string };
  twitter: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string };
  facebook: { pageId: string; pageAccessToken: string };
  instagram: { igUserId: string; accessToken: string };
  youtube: { clientId: string; clientSecret: string; refreshToken: string };
};

/** Which config field is the plaintext webhook routing key for a provider. */
const lookupField: Partial<Record<Provider, string>> = { meta_whatsapp: "phoneNumberId", twilio: "phoneNumber" };

/** Decrypted credentials for a tenant's provider, or null if not connected / disabled. */
export async function getIntegration<P extends Provider>(tenantId: string, provider: P): Promise<ProviderConfig[P] | null> {
  const [row] = await db.select().from(integrations).where(and(eq(integrations.tenantId, tenantId), eq(integrations.provider, provider)));
  if (!row || !row.enabled) return null;
  return decryptJson<ProviderConfig[P]>(row.configEncrypted);
}

export async function saveIntegration<P extends Provider>(tenantId: string, provider: P, config: ProviderConfig[P]) {
  const f = lookupField[provider];
  const lookupKey = f ? String((config as Record<string, string>)[f] ?? "").trim() || null : null;
  const configEncrypted = encryptJson(config);
  await db
    .insert(integrations)
    .values({ tenantId, provider, configEncrypted, lookupKey })
    .onConflictDoUpdate({ target: [integrations.tenantId, integrations.provider], set: { configEncrypted, lookupKey, enabled: true } });
}

/** Webhook routing: find the tenant that owns a WhatsApp phoneNumberId or Twilio phone number. */
export async function findTenantByLookup<P extends Provider>(provider: P, lookupKey: string): Promise<{ tenantId: string; config: ProviderConfig[P] } | null> {
  const [row] = await db.select().from(integrations).where(and(eq(integrations.provider, provider), eq(integrations.lookupKey, lookupKey)));
  if (!row || !row.enabled) return null;
  return { tenantId: row.tenantId, config: decryptJson<ProviderConfig[P]>(row.configEncrypted) };
}
