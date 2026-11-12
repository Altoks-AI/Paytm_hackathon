import type { NextRequest } from "next/server";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { getAgentSettings } from "@/lib/tenant-data";
import { findAgentByPhone } from "@/lib/agents";
import { findTenantByLookup, getIntegration } from "@/lib/integrations";
import { hasCredits } from "@/lib/credits";
import { getOrCreateConversation } from "@/lib/conversations";
import { forbidden, hangup, isValidTwilio, readTwilioForm, speakAndListen } from "@/lib/voice/twiml";
import { voiceCtx } from "@/lib/voice/session";
import { realtimeEnabled, streamTwiml } from "@/lib/voice/stream-token";
import { startRecording } from "@/lib/voice/recording";

export async function POST(req: NextRequest) {
  const p = await readTwilioForm(req);
  // Route by the agent that owns the dialled number; otherwise the integration's number → the tenant's default agent.
  const owner = p.To ? await findAgentByPhone(p.To) : null;
  const ownerCfg = owner ? await getIntegration(owner.tenantId, "twilio") : null;
  const tenant = owner && ownerCfg ? { tenantId: owner.tenantId, config: ownerCfg } : p.To ? await findTenantByLookup("twilio", p.To) : null;
  if (!tenant) return hangup("This number is not configured. Goodbye.");
  if (!isValidTwilio(req, tenant.config.authToken, p)) return forbidden();

  const settings = owner && ownerCfg ? owner : await getAgentSettings(tenant.tenantId);
  if (!settings?.voiceEnabled || !(await hasCredits(tenant.tenantId, "voice_minute"))) return hangup("Sorry, we are unable to take your call right now. Please try again later. Goodbye.");

  const conversation = await getOrCreateConversation({ tenantId: tenant.tenantId, agentId: settings?.id, channel: "voice", externalId: p.CallSid, customerPhone: p.From });
  const [call] = await db
    .insert(calls)
    .values({ tenantId: tenant.tenantId, agentId: settings?.id ?? null, callSid: p.CallSid, direction: "inbound", fromNumber: p.From, toNumber: p.To, status: "in-progress", conversationId: conversation.id })
    .onConflictDoUpdate({ target: calls.callSid, set: { conversationId: conversation.id } })
    .returning();

  startRecording(tenant.tenantId, call.id, p.CallSid);
  if (realtimeEnabled()) return streamTwiml(call.id, p.CallSid);
  return speakAndListen(settings.greeting || "Hi! How can I help you today?", voiceCtx(settings), call.id);
}
