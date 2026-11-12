"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, handoffs, messages } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { sendWhatsAppText } from "@/lib/whatsapp";

async function ownConversation(id: string) {
  const { tenantId } = await requireTenant();
  const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)));
  if (!conv) redirect("/conversations");
  return { tenantId, conv };
}

export async function sendReply(id: string, form: FormData) {
  const { tenantId, conv } = await ownConversation(id);
  const text = String(form.get("text") ?? "").trim().slice(0, 4000);
  if (!text) return;
  let error: string | undefined;
  if (conv.channel === "whatsapp") {
    error = (await sendWhatsAppText(tenantId, conv.customerPhone || conv.externalId, text)).error;
  } else if (conv.channel === "voice") {
    error = "Voice calls can't receive text replies";
  }
  if (!error) {
    await db.insert(messages).values({ tenantId, conversationId: id, role: "human", content: text });
    // A staff reply means a human has taken over: pause the AI.
    await db.update(conversations).set({ status: "handoff", updatedAt: new Date() }).where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)));
  }
  revalidatePath(`/conversations/${id}`);
  revalidatePath("/conversations");
  if (error) redirect(`/conversations/${id}?error=${encodeURIComponent(error)}`);
}

export async function setConversationStatus(id: string, status: "open" | "handoff" | "closed") {
  const { tenantId } = await ownConversation(id);
  await db.update(conversations).set({ status, updatedAt: new Date() }).where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)));
  if (status !== "handoff") {
    await db.update(handoffs).set({ status: "resolved" }).where(and(eq(handoffs.conversationId, id), eq(handoffs.tenantId, tenantId), eq(handoffs.status, "pending")));
  }
  revalidatePath(`/conversations/${id}`);
  revalidatePath("/conversations");
  revalidatePath("/handoffs");
}
