"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSettings, agentTools, knowledgeItems } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { ensureAgentSettings, newWidgetKey } from "@/lib/agent/settings";
import { BUILTIN_TOOLS, saveCustomTool } from "@/lib/agent/custom-tools";
import { AGENT_TEMPLATES } from "./templates";
import { LANGUAGE_CODES, VOICE_IDS, type FormState, type ToolPayload } from "./options";

const s = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

async function update(values: Partial<typeof agentSettings.$inferInsert>): Promise<FormState> {
  const { tenantId } = await requireTenant();
  try {
    await ensureAgentSettings(tenantId);
    await db.update(agentSettings).set({ ...values, updatedAt: new Date() }).where(eq(agentSettings.tenantId, tenantId));
  } catch {
    return { error: "Could not save — please try again.", at: Date.now() };
  }
  revalidatePath("/agent");
  return { ok: true, at: Date.now() };
}

const fail = (error: string): FormState => ({ error, at: Date.now() });

export async function saveGeneral(_: FormState, form: FormData): Promise<FormState> {
  const phone = s(form, "handoffPhone", 30).replace(/[\s-]/g, "");
  if (phone && !/^\+?\d{6,15}$/.test(phone)) return fail("Handoff phone must be a number like +919876543210");
  return update({
    agentName: s(form, "agentName", 80) || "Assistant",
    basePrompt: s(form, "basePrompt", 8000),
    greeting: s(form, "greeting", 500) || "Hi! How can I help you today?",
    handoffPhone: phone || null,
  });
}

export async function applyTemplate(templateId: string): Promise<FormState> {
  const t = AGENT_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return fail("Unknown template");
  return update({
    agentName: t.agentName,
    greeting: t.greeting,
    basePrompt: t.basePrompt,
    language: t.language,
    extraLanguages: t.extraLanguages,
    voice: t.voice,
    disabledTools: BUILTIN_TOOLS.filter((b) => !t.tools.includes(b.name)).map((b) => b.name),
  });
}

export async function saveLanguageVoice(_: FormState, form: FormData): Promise<FormState> {
  const language = s(form, "language", 20);
  if (!LANGUAGE_CODES.includes(language)) return fail("Pick a default language");
  const extraLanguages = [...new Set(form.getAll("extraLanguages").map(String))].filter((c) => c !== language && LANGUAGE_CODES.includes(c));
  const voice = s(form, "voice", 40);
  if (!VOICE_IDS.includes(voice)) return fail("Pick a voice");
  return update({ language, extraLanguages, voice });
}

export async function saveModel(_: FormState, form: FormData): Promise<FormState> {
  const model = s(form, "model", 120);
  if (!/^[\w.:~-]+\/[\w.:~/-]+$/.test(model)) return fail("Enter an OpenRouter model id like openai/gpt-4o-mini");
  const t = Number(form.get("temperature"));
  const temperature = Number.isFinite(t) ? Math.round(Math.min(1, Math.max(0, t)) * 10) / 10 : 0.4;
  return update({ model, temperature });
}

export async function saveBuiltinTools(_: FormState, form: FormData): Promise<FormState> {
  return update({ disabledTools: BUILTIN_TOOLS.filter((t) => form.get(`tool_${t.name}`) !== "on").map((t) => t.name) });
}

export async function saveChannels(_: FormState, form: FormData): Promise<FormState> {
  return update({
    whatsappEnabled: form.get("whatsappEnabled") === "on",
    voiceEnabled: form.get("voiceEnabled") === "on",
    chatbotEnabled: form.get("chatbotEnabled") === "on",
  });
}

export async function saveWidget(_: FormState, form: FormData): Promise<FormState> {
  const color = s(form, "widgetColor", 9);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return fail("Invalid color");
  return update({ widgetColor: color });
}

export async function regenerateWidgetKey() {
  const { tenantId } = await requireTenant();
  await db.update(agentSettings).set({ widgetKey: newWidgetKey(), updatedAt: new Date() }).where(eq(agentSettings.tenantId, tenantId));
  revalidatePath("/agent");
}

/* ---------- custom webhook tools ---------- */

export async function saveTool(id: string | null, input: ToolPayload): Promise<string | null> {
  const { tenantId } = await requireTenant();
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
  const { tenantId } = await requireTenant();
  const title = s(form, "title", 200);
  const content = s(form, "content", 6000);
  if (!title || !content) return;
  await db.insert(knowledgeItems).values({ tenantId, title, content });
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
