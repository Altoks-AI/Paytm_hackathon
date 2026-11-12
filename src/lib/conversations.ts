import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { conversations, type Channel } from "@/db/schema";

/** Reuse the latest non-closed conversation for (tenant, channel, externalId), else create one. */
export async function getOrCreateConversation(input: {
  tenantId: string;
  channel: Channel;
  externalId: string;
  customerPhone?: string;
  customerName?: string;
  /** agent that handles this conversation (new conversations only) */
  agentId?: string | null;
  /** values for {{variables}} in the agent prompt (new conversations only) */
  variables?: Record<string, string>;
}) {
  const { tenantId, channel, externalId } = input;
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.channel, channel), eq(conversations.externalId, externalId), ne(conversations.status, "closed"), ...(input.agentId ? [eq(conversations.agentId, input.agentId)] : [])))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);
  if (existing) {
    if (input.customerName && !existing.customerName) {
      const [updated] = await db
        .update(conversations)
        .set({ customerName: input.customerName })
        .where(and(eq(conversations.id, existing.id), eq(conversations.tenantId, tenantId)))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }
  const [created] = await db
    .insert(conversations)
    .values({ tenantId, agentId: input.agentId ?? null, variables: input.variables ?? {}, channel, externalId, customerPhone: input.customerPhone ?? null, customerName: input.customerName ?? null })
    .returning();
  return created;
}
