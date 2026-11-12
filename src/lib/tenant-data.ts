// Framework-free tenant helpers (no next/* or auth imports) — safe to load from the custom server (server.ts).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, agentSettings } from "@/db/schema";

export async function getAgentSettings(tenantId: string) {
  const [s] = await db.select().from(agentSettings).where(eq(agentSettings.tenantId, tenantId));
  return s ?? null;
}

export async function getTenant(tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return t ?? null;
}

/** Public base URL for webhooks / widget embed. */
export function appUrl() {
  return (process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3000")).replace(/\/$/, "");
}
