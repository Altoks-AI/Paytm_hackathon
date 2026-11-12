"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, handoffs } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";

export async function resolveHandoff(id: string) {
  const { tenantId } = await requireTenant();
  const [h] = await db
    .update(handoffs)
    .set({ status: "resolved" })
    .where(and(eq(handoffs.id, id), eq(handoffs.tenantId, tenantId)))
    .returning({ conversationId: handoffs.conversationId });
  if (h) {
    await db
      .update(conversations)
      .set({ status: "open", updatedAt: new Date() })
      .where(and(eq(conversations.id, h.conversationId), eq(conversations.tenantId, tenantId), eq(conversations.status, "handoff")));
  }
  revalidatePath("/handoffs");
  revalidatePath("/conversations");
}
