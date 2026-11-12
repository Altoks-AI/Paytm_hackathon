"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { agents, agentTools, knowledgeItems } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { getAgent, listAgents, newWidgetKey } from "@/lib/agents";
import { BUILTIN_TOOLS, saveCustomTool } from "@/lib/agent/custom-tools";
import { configureNumberWebhook, listTwilioNumbers } from "@/lib/voice/numbers";
import { listWhatsAppNumbers } from "@/lib/whatsapp-numbers";
import { AGENT_TEMPLATES } from "./templates";
import { LANGUAGE_CODES, VOICE_IDS, type FormState, type ToolPayload } from "./options";

const s = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const fail = (error: string): FormState => ({ error, at: Date.now() });

/** The tenant's agent for this request (throws if it doesn't belong to the tenant). */
async function ownAgent(agentId: unknown) {
  const { tenantId } = await requireTenant();
  const a = typeof agentId === "string" && agentId ? await getAgent(tenantId, agentId) : null;
  if (!a || a.id !== agentId) throw new Error("Agent not found");
  return { tenantId, agent: a };
}

async function update(form: FormData, values: Partial<typeof agents.$inferInsert>): Promise<FormState> {
  try {
    const { tenantId, agent } = await ownAgent(form.get("agentId"));
    await db.update(agents).set({ ...values, updatedAt: new Date() }).where(and(eq(agents.id, agent.id), eq(agents.tenantId, tenantId)));
  } catch {
    return fail("Could not save — please try again.");
  }
  revalidatePath("/agent");
  return { ok: true, at: Date.now() };
}

/* ---------- agents ---------- */

export async function createAgent(templateId: string | null): Promise<string | null> {
  const { tenantId } = await requireTenant();
  const t = templateId ? AGENT_TEMPLATES.find((x) => x.id === templateId) : undefined;
  const count = (await listAgents(tenantId)).length;
  const [a] = await db
    .insert(agents)
    .values({
      tenantId,
      widgetKey: newWidgetKey(),
      agentName: t?.agentName ?? `Agent ${count + 1}`,
      ...(t
        ? {
            greeting: t.greeting,
            basePrompt: t.basePrompt,
            language: t.language,
            extraLanguages: t.extraLanguages,
            voice: t.voice,
            disabledTools: BUILTIN_TOOLS.filter((b) => !t.tools.includes(b.name)).map((b) => b.name),
          }
        : {}),
    })
    .returning({ id: agents.id });
  revalidatePath("/agent");
  return a?.id ?? null;
}

export async function duplicateAgent(agentId: string) {
  const { tenantId, agent } = await ownAgent(agentId);
  const { id: _id, createdAt: _c, updatedAt: _u, phoneNumber: _p, widgetKey: _w, ...copy } = agent;
  void [_id, _c, _u, _p, _w];
  const [a] = await db.insert(agents).values({ ...copy, tenantId, agentName: `${agent.agentName} (copy)`, widgetKey: newWidgetKey(), whatsappPhoneNumberId: null, whatsappNumber: null }).returning({ id: agents.id });
  const [kb, tools] = await Promise.all([
    db.select().from(knowledgeItems).where(and(eq(knowledgeItems.tenantId, tenantId), eq(knowledgeItems.agentId, agent.id))),
    db.select().from(agentTools).where(and(eq(agentTools.tenantId, tenantId), eq(agentTools.agentId, agent.id))),
  ]);
  if (kb.length) await db.insert(knowledgeItems).values(kb.map(({ id: _k, createdAt: _kc, ...k }) => (void [_k, _kc], { ...k, agentId: a.id })));
  if (tools.length) await db.insert(agentTools).values(tools.map(({ id: _t, createdAt: _tc, ...t }) => (void [_t, _tc], { ...t, agentId: a.id })));
  revalidatePath("/agent");
  redirect(`/agent?agent=${a.id}`);
}

export async function deleteAgent(agentId: string) {
  const { tenantId, agent } = await ownAgent(agentId);
  if ((await listAgents(tenantId)).length <= 1) return;
  await db.delete(agents).where(and(eq(agents.id, agent.id), eq(agents.tenantId, tenantId)));
  revalidatePath("/agent");
  redirect("/agent");
}

export async function applyTemplate(agentId: string, templateId: string): Promise<FormState> {
  const t = AGENT_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return fail("Unknown template");
  const f = new FormData();
  f.set("agentId", agentId);
  return update(f, {
    agentName: t.agentName,
    greeting: t.greeting,
    basePrompt: t.basePrompt,
    language: t.language,
    extraLanguages: t.extraLanguages,
    voice: t.voice,
    disabledTools: BUILTIN_TOOLS.filter((b) => !t.tools.includes(b.name)).map((b) => b.name),
  });
}

/* ---------- settings ---------- */

export async function saveGeneral(_: FormState, form: FormData): Promise<FormState> {
  const phone = s(form, "handoffPhone", 30).replace(/[\s-]/g, "");
  if (phone && !/^\+?\d{6,15}$/.test(phone)) return fail("Handoff phone must be a number like +919876543210");
  return update(form, {
    agentName: s(form, "agentName", 80) || "Assistant",
    basePrompt: s(form, "basePrompt", 8000),
    greeting: s(form, "greeting", 500) || "Hi! How can I help you today?",
    handoffPhone: phone || null,
  });
}

export async function saveLanguageVoice(_: FormState, form: FormData): Promise<FormState> {
  const language = s(form, "language", 20);
  if (!LANGUAGE_CODES.includes(language)) return fail("Pick a default language");
  const extraLanguages = [...new Set(form.getAll("extraLanguages").map(String))].filter((c) => c !== language && LANGUAGE_CODES.includes(c));
  const voice = s(form, "voice", 60);
  if (!VOICE_IDS.includes(voice)) return fail("Pick a voice");
  return update(form, { language, extraLanguages, voice });
}

export async function saveModel(_: FormState, form: FormData): Promise<FormState> {
  const model = s(form, "model", 120);
  if (!/^[\w.:~-]+\/[\w.:~/-]+$/.test(model)) return fail("Enter an OpenRouter model id like openai/gpt-4o-mini");
  const t = Number(form.get("temperature"));
  const temperature = Number.isFinite(t) ? Math.round(Math.min(1, Math.max(0, t)) * 10) / 10 : 0.4;
  return update(form, { model, temperature });
}

export async function saveBuiltinTools(_: FormState, form: FormData): Promise<FormState> {
  return update(form, { disabledTools: BUILTIN_TOOLS.filter((t) => form.get(`tool_${t.name}`) !== "on").map((t) => t.name) });
}

export async function saveChannels(_: FormState, form: FormData): Promise<FormState> {
  let ctx;
  try {
    ctx = await ownAgent(form.get("agentId"));
  } catch {
    return fail("Agent not found");
  }
  const { tenantId, agent } = ctx;
  const whatsappEnabled = form.get("whatsappEnabled") === "on";
  const phoneNumber = s(form, "phoneNumber", 30) || null;
  const waId = s(form, "whatsappPhoneNumberId", 40) || null;
  let whatsappNumber: string | null = null;
  if (waId) {
    const wa = (await listWhatsAppNumbers(tenantId)).numbers.find((n) => n.id === waId);
    if (!wa) return fail("That WhatsApp number is not in your WhatsApp Business Account.");
    const [taken] = await db.select({ name: agents.agentName }).from(agents).where(and(eq(agents.whatsappPhoneNumberId, waId), ne(agents.id, agent.id)));
    if (taken) return fail(`${wa.display} is already assigned to "${taken.name}". Unassign it there first.`);
    whatsappNumber = wa.display;
  }

  if (phoneNumber) {
    const { numbers } = await listTwilioNumbers(tenantId);
    if (!numbers.some((n) => n.phoneNumber === phoneNumber)) return fail("That number is not on your Twilio account.");
    const [taken] = await db.select({ name: agents.agentName }).from(agents).where(and(eq(agents.phoneNumber, phoneNumber), ne(agents.id, agent.id)));
    if (taken) return fail(`${phoneNumber} is already assigned to "${taken.name}". Unassign it there first.`);
  }
  const res = await update(form, {
    whatsappEnabled,
    whatsappPhoneNumberId: waId,
    whatsappNumber,
    voiceEnabled: form.get("voiceEnabled") === "on",
    chatbotEnabled: form.get("chatbotEnabled") === "on",
    phoneNumber,
  });
  if (res.ok && phoneNumber && phoneNumber !== agent.phoneNumber) {
    const warn = await configureNumberWebhook(tenantId, phoneNumber);
    if (warn) return { ok: true, at: Date.now(), error: `Saved. Note: ${warn}` };
  }
  return res;
}

export async function saveWidget(_: FormState, form: FormData): Promise<FormState> {
  const color = s(form, "widgetColor", 9);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return fail("Invalid color");
  return update(form, { widgetColor: color });
}

export async function regenerateWidgetKey(form: FormData) {
  const { tenantId, agent } = await ownAgent(form.get("agentId"));
  await db.update(agents).set({ widgetKey: newWidgetKey(), updatedAt: new Date() }).where(and(eq(agents.id, agent.id), eq(agents.tenantId, tenantId)));
  revalidatePath("/agent");
}

/* ---------- custom webhook tools ---------- */

export async function saveTool(agentId: string, id: string | null, input: ToolPayload): Promise<string | null> {
  const { tenantId, agent } = await ownAgent(agentId);
  const str = (v: unknown, max: number) => (typeof v === "string" ? v : "").slice(0, max);
  const headers =
    input.headers && typeof input.headers === "object"
      ? Object.fromEntries(Object.entries(input.headers).slice(0, 20).map(([k, v]) => [str(k, 100), str(v, 2000)]))
      : undefined;
  const parameters = (Array.isArray(input.parameters) ? input.parameters : []).slice(0, 30).map((p) => ({
    name: str(p?.name, 48),
    type: p?.type === "number" || p?.type === "boolean" ? p.type : ("string" as const),
    description: str(p?.description, 500),
    required: p?.required === true,
  }));
  const err = await saveCustomTool(
    tenantId,
    agent.id,
    { name: str(input.name, 64), description: str(input.description, 1000), method: str(input.method, 10), url: str(input.url, 1000), headers, parameters, enabled: input.enabled !== false },
    id ?? undefined
  );
  if (!err) revalidatePath("/agent");
  return err;
}

export async function toggleTool(id: string, enabled: boolean) {
  const { tenantId } = await requireTenant();
  await db.update(agentTools).set({ enabled: !!enabled }).where(and(eq(agentTools.id, id), eq(agentTools.tenantId, tenantId)));
  revalidatePath("/agent");
}

export async function deleteTool(id: string) {
  const { tenantId } = await requireTenant();
  await db.delete(agentTools).where(and(eq(agentTools.id, id), eq(agentTools.tenantId, tenantId)));
  revalidatePath("/agent");
}

/* ---------- knowledge base ---------- */

export async function addKnowledge(form: FormData) {
  const { tenantId, agent } = await ownAgent(form.get("agentId"));
  const title = s(form, "title", 200);
  const content = s(form, "content", 6000);
  if (!title || !content) return;
  await db.insert(knowledgeItems).values({ tenantId, agentId: agent.id, title, content });
  revalidatePath("/agent");
}

export async function updateKnowledge(id: string, form: FormData) {
  const { tenantId } = await requireTenant();
  const title = s(form, "title", 200);
  const content = s(form, "content", 6000);
  if (!title || !content) return;
  await db.update(knowledgeItems).set({ title, content }).where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.tenantId, tenantId)));
  revalidatePath("/agent");
}

export async function deleteKnowledge(id: string) {
  const { tenantId } = await requireTenant();
  await db.delete(knowledgeItems).where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.tenantId, tenantId)));
  revalidatePath("/agent");
}
