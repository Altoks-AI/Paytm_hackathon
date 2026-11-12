import { getOrCreateConversation } from "@/lib/conversations";
import { runAgent } from "@/lib/agent/run";
import { chargeCredits, hasCredits } from "@/lib/credits";
import { json, preflight, rateLimited, settingsByKey, validSession } from "../shared";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  let body: { key?: string; sessionId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!validSession(body.sessionId)) return json({ error: "Invalid session" }, 400);
  if (!message) return json({ error: "Message required" }, 400);
  if (message.length > 2000) return json({ error: "Message too long (max 2000 characters)" }, 413);

  const s = await settingsByKey(body.key);
  if (!s) return json({ error: "Unknown widget key" }, 404);
  if (!s.chatbotEnabled) return json({ error: "Chat is currently unavailable" }, 403);
  if (rateLimited(`s:${body.sessionId}`, 12) || rateLimited(`k:${s.tenantId}`, 300)) return json({ error: "Too many messages, please slow down" }, 429);

  if (!(await hasCredits(s.tenantId, "chatbot_message"))) return json({ error: "Chat is currently unavailable" }, 403);

  const conversation = await getOrCreateConversation({ tenantId: s.tenantId, channel: "chatbot", externalId: body.sessionId });
  const result = await runAgent({ tenantId: s.tenantId, conversationId: conversation.id, channel: "chatbot", userMessage: message });
  if (result.reply) await chargeCredits(s.tenantId, "chatbot_message", { allowNegative: true });
  return json({ reply: result.reply, handoff: result.handoff || conversation.status === "handoff", ended: result.ended });
}
