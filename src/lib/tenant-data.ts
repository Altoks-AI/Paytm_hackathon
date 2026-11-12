// Framework-free tenant helpers (no next/* or auth imports) — safe to load from the custom server (server.ts).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getAgent } from "@/lib/agents";

/** An agent's settings: the given agent, or the tenant's first (default) agent. */
export async function getAgentSettings(tenantId: string, agentId?: string | null) {
  return getAgent(tenantId, agentId);
}

export async function getTenant(tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return t ?? null;
}

/** Public base URL for webhooks / widget embed. */
export function appUrl() {
  return (process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3000")).replace(/\/$/, "");
}
