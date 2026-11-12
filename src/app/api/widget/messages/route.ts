import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { json, preflight, rateLimited, settingsByKey, validSession } from "../shared";

export const OPTIONS = preflight;

/**
 * Without `after`: full recent history for the session (to restore the widget).
 * With `after` (ISO timestamp): only staff ("human") messages newer than it, for polling after handoff.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const sessionId = p.get("sessionId");
  if (!validSession(sessionId)) return json({ error: "Invalid session" }, 400);
  const s = await settingsByKey(p.get("key"));
  if (!s) return json({ error: "Unknown widget key" }, 404);
  if (!s.chatbotEnabled) return json({ error: "Chat is currently unavailable" }, 403);
  if (rateLimited(`p:${sessionId}`, 40)) return json({ error: "Too many requests" }, 429);

  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.tenantId, s.tenantId), eq(conversations.channel, "chatbot"), eq(conversations.externalId, sessionId)))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);
  if (!conv) return json({ messages: [], status: "none", now: new Date().toISOString() });

  const afterRaw = p.get("after");
  const after = afterRaw ? new Date(afterRaw) : null;
  const base = and(eq(messages.tenantId, s.tenantId), eq(messages.conversationId, conv.id));
  const rows =
    after && !isNaN(after.getTime())
      ? await db.select().from(messages).where(and(base, eq(messages.role, "human"), gt(messages.createdAt, after))).orderBy(asc(messages.createdAt)).limit(50)
      : (await db.select().from(messages).where(and(base, inArray(messages.role, ["user", "assistant", "human"]))).orderBy(desc(messages.createdAt)).limit(50)).reverse();

  return json({
    status: conv.status,
    now: new Date().toISOString(),
    messages: rows.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })),
  });
}
