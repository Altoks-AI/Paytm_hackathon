// Framework-free agent helpers (no next/* or auth imports) — safe to load from the custom server (server.ts).
import { randomBytes } from "crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { agents, agentTools, knowledgeItems, legacyAgentSettings, type Agent } from "@/db/schema";

export const newWidgetKey = () => `wk_${randomBytes(16).toString("hex")}`;

const g = globalThis as unknown as { __agentsEnsured?: Set<string> };
const ensured = (g.__agentsEnsured ??= new Set<string>());

/**
 * Make sure the tenant has at least one agent. The first time, the old single-agent settings row (if any)
 * is copied into a new agent and tenant-wide knowledge / webhook tools are attached to it.
 */
export async function ensureAgents(tenantId: string): Promise<void> {
  if (ensured.has(tenantId)) return;
  const [first] = await db.select({ id: agents.id }).from(agents).where(eq(agents.tenantId, tenantId)).limit(1);
  if (!first) {
    const [legacy] = await db.select().from(legacyAgentSettings).where(eq(legacyAgentSettings.tenantId, tenantId));
    const values = legacy ? { ...legacy, updatedAt: new Date() } : { tenantId, widgetKey: newWidgetKey() };
    const [created] = await db.insert(agents).values(values).onConflictDoNothing().returning({ id: agents.id });
    if (created) {
      await db.update(knowledgeItems).set({ agentId: created.id }).where(and(eq(knowledgeItems.tenantId, tenantId), isNull(knowledgeItems.agentId)));
      await db.update(agentTools).set({ agentId: created.id }).where(and(eq(agentTools.tenantId, tenantId), isNull(agentTools.agentId)));
    }
  }
  ensured.add(tenantId);
}

export async function listAgents(tenantId: string): Promise<Agent[]> {
  await ensureAgents(tenantId);
  return db.select().from(agents).where(eq(agents.tenantId, tenantId)).orderBy(asc(agents.createdAt));
}

/** The given agent (scoped to the tenant), or the tenant's first agent when no / unknown id is given. */
export async function getAgent(tenantId: string, agentId?: string | null): Promise<Agent | null> {
  if (agentId) {
    const [a] = await db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)));
    if (a) return a;
  }
  await ensureAgents(tenantId);
  const [a] = await db.select().from(agents).where(eq(agents.tenantId, tenantId)).orderBy(asc(agents.createdAt)).limit(1);
  return a ?? null;
}

/** Agent that owns a Twilio number (inbound call routing). */
export async function findAgentByPhone(phone: string): Promise<Agent | null> {
  const [a] = await db.select().from(agents).where(eq(agents.phoneNumber, phone));
  return a ?? null;
}

/** The agent that answers the tenant's WhatsApp number. */
export async function whatsappAgent(tenantId: string): Promise<Agent | null> {
  await ensureAgents(tenantId);
  const [a] = await db.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.whatsappEnabled, true))).orderBy(asc(agents.createdAt)).limit(1);
  return a ?? null;
}
