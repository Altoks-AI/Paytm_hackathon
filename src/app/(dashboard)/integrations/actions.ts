"use server";

import { randomBytes } from "crypto";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { integrations, type Provider } from "@/db/schema";
import { decryptJson } from "@/lib/crypto";
import { saveIntegration, type ProviderConfig } from "@/lib/integrations";
import { requireTenant } from "@/lib/tenant";
import { getProviderDef } from "./providers";

export type SaveState = { ok?: boolean; error?: string; at?: number };

const where = (tenantId: string, provider: Provider) => and(eq(integrations.tenantId, tenantId), eq(integrations.provider, provider));

/** E.164: keep digits, ensure a leading +. */
function toE164(raw: string) {
  const s = raw.trim().replace(/^00/, "+");
  const digits = s.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function refresh() {
  revalidatePath("/integrations");
  revalidatePath("/dashboard");
}

export async function saveProvider(provider: string, _: SaveState, formData: FormData): Promise<SaveState> {
  const { tenantId } = await requireTenant();
  const def = getProviderDef(provider);
  if (!def) return { error: "Unknown provider" };

  const [row] = await db.select().from(integrations).where(where(tenantId, def.id));
  let existing: Record<string, string> = {};
  if (row) {
    try {
      existing = decryptJson<Record<string, string>>(row.configEncrypted);
    } catch {
      existing = {};
    }
  }

  const config: Record<string, string> = {};
  for (const f of def.fields) {
    const v = String(formData.get(f.key) ?? "").trim();
    const val = v || existing[f.key] || "";
    if (val) config[f.key] = val;
  }
  if (def.id === "meta_whatsapp" && !config.verifyToken) config.verifyToken = randomBytes(12).toString("hex");
  if (def.id === "twilio" && config.phoneNumber) {
    config.phoneNumber = toE164(config.phoneNumber);
    if (!/^\+\d{8,15}$/.test(config.phoneNumber)) return { error: "Phone number must include country code, e.g. +14155550123", at: Date.now() };
  }
  const missing = def.fields.filter((f) => !f.optional && !config[f.key]).map((f) => f.label);
  if (missing.length) return { error: `Missing: ${missing.join(", ")}`, at: Date.now() };

  const lookup = def.id === "meta_whatsapp" ? config.phoneNumberId : def.id === "twilio" ? config.phoneNumber : null;
  if (lookup) {
    const [taken] = await db
      .select({ id: integrations.id })
      .from(integrations)
      .where(and(eq(integrations.provider, def.id), eq(integrations.lookupKey, lookup), ne(integrations.tenantId, tenantId)));
    if (taken) return { error: "This number is already connected to another account", at: Date.now() };
  }

  try {
    await saveIntegration(tenantId, def.id, config as unknown as ProviderConfig[typeof def.id]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { error: `Could not save: ${msg || "unknown error"}`, at: Date.now() };
  }
  refresh();
  return { ok: true, at: Date.now() };
}

export async function setProviderEnabled(provider: string, enabled: boolean) {
  const { tenantId } = await requireTenant();
  const def = getProviderDef(provider);
  if (!def) return;
  await db.update(integrations).set({ enabled }).where(where(tenantId, def.id));
  refresh();
}

export async function disconnectProvider(provider: string) {
  const { tenantId } = await requireTenant();
  const def = getProviderDef(provider);
  if (!def) return;
  await db.delete(integrations).where(where(tenantId, def.id));
  refresh();
}
