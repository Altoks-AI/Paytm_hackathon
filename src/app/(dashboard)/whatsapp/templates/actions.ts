"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { waTemplates } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { isUuid } from "@/lib/leads";
import { LANGUAGES, LEAD_FIELDS, countVariables, defaultSample, metaCreateTemplate, metaDeleteTemplate, metaListTemplates, toTemplateName } from "@/lib/wa-templates";
import { NOT_CONNECTED, metaConfig } from "../_components/meta";

export type FormState = { error?: string } | undefined;
const PATH = "/whatsapp/templates";

const parseJson = (v: FormDataEntryValue | null): unknown => {
  try { return JSON.parse(String(v ?? "[]")); } catch { return []; }
};

export async function createTemplate(_: FormState, fd: FormData): Promise<FormState> {
  const { tenantId } = await requireTenant();
  const name = toTemplateName(String(fd.get("name") || ""));
  const language = String(fd.get("language") || "en");
  const category = String(fd.get("category")) === "UTILITY" ? "UTILITY" : "MARKETING";
  const body = String(fd.get("body") || "").trim();
  const submit = fd.get("intent") === "submit";
  if (!name) return { error: "Template name is required" };
  if (!LANGUAGES.includes(language)) return { error: "Unsupported language" };
  if (!body) return { error: "Body is required" };
  if (body.length > 1024) return { error: "Body must be at most 1024 characters" };
  const { count, error } = countVariables(body);
  if (error) return { error };

  const rawVars = parseJson(fd.get("variables"));
  const rawSamples = parseJson(fd.get("samples"));
  const variables: string[] = [];
  const samples: string[] = [];
  for (let i = 0; i < count; i++) {
    const v = Array.isArray(rawVars) ? String(rawVars[i] ?? "") : "";
    const valid = (LEAD_FIELDS as readonly string[]).includes(v) || /^custom:\S/.test(v);
    if (!valid) return { error: `Choose a mapping for {{${i + 1}}}` };
    variables.push(v.startsWith("custom:") ? "custom:" + v.slice(7).trim() : v);
    const s = Array.isArray(rawSamples) ? String(rawSamples[i] ?? "").trim() : "";
    samples.push(s || defaultSample(v));
  }

  const [dup] = await db.select({ id: waTemplates.id }).from(waTemplates).where(and(eq(waTemplates.tenantId, tenantId), eq(waTemplates.name, name), eq(waTemplates.language, language)));
  if (dup) return { error: `A template named "${name}" (${language}) already exists` };

  let metaStatus = "draft";
  let metaTemplateId: string | null = null;
  if (submit) {
    const cfg = await metaConfig(tenantId);
    if (!cfg) return { error: NOT_CONNECTED };
    const r = await metaCreateTemplate(cfg, { name, language, category, body, samples });
    if (r.error || !r.data) return { error: `Meta: ${r.error}` };
    metaTemplateId = r.data.id;
    metaStatus = r.data.status || "PENDING";
  }
  await db.insert(waTemplates).values({ tenantId, name, language, category, body, variables, metaStatus, metaTemplateId });
  revalidatePath(PATH);
  redirect(PATH);
}

export async function submitTemplate(id: string) {
  const { tenantId } = await requireTenant();
  if (!isUuid(id)) return { error: "Invalid template" };
  const [t] = await db.select().from(waTemplates).where(and(eq(waTemplates.id, id), eq(waTemplates.tenantId, tenantId)));
  if (!t) return { error: "Template not found" };
  if (t.metaStatus !== "draft") return { error: "Already submitted" };
  const cfg = await metaConfig(tenantId);
  if (!cfg) return { error: NOT_CONNECTED };
  const r = await metaCreateTemplate(cfg, { name: t.name, language: t.language, category: t.category, body: t.body, samples: t.variables.map(defaultSample) });
  if (r.error || !r.data) return { error: `Meta: ${r.error}` };
  await db.update(waTemplates).set({ metaTemplateId: r.data.id, metaStatus: r.data.status || "PENDING" }).where(eq(waTemplates.id, t.id));
  revalidatePath(PATH);
  return { ok: "Submitted to Meta for review" };
}

export async function syncTemplates() {
  const { tenantId } = await requireTenant();
  const cfg = await metaConfig(tenantId);
  if (!cfg) return { error: NOT_CONNECTED };
  const r = await metaListTemplates(cfg);
  if (r.error || !r.data) return { error: `Meta: ${r.error}` };
  const local = await db.select().from(waTemplates).where(eq(waTemplates.tenantId, tenantId));
  let updated = 0;
  for (const t of local) {
    if (t.metaStatus === "draft") continue;
    const m = r.data.find((x) => x.id === t.metaTemplateId) ?? r.data.find((x) => x.name === t.name && x.language === t.language);
    const status = m?.status ?? "DELETED";
    if (status !== t.metaStatus || (m && m.id !== t.metaTemplateId)) {
      await db.update(waTemplates).set({ metaStatus: status, metaTemplateId: m?.id ?? t.metaTemplateId }).where(eq(waTemplates.id, t.id));
      updated++;
    }
  }
  revalidatePath(PATH);
  return { ok: updated ? `Updated ${updated} template status${updated === 1 ? "" : "es"}` : "All statuses are up to date" };
}

export async function importTemplates() {
  const { tenantId } = await requireTenant();
  const cfg = await metaConfig(tenantId);
  if (!cfg) return { error: NOT_CONNECTED };
  const r = await metaListTemplates(cfg);
  if (r.error || !r.data) return { error: `Meta: ${r.error}` };
  const local = await db.select({ name: waTemplates.name, language: waTemplates.language }).from(waTemplates).where(eq(waTemplates.tenantId, tenantId));
  const have = new Set(local.map((t) => `${t.name}|${t.language}`));
  const fresh = r.data
    .filter((m) => m.status === "APPROVED" && !have.has(`${m.name}|${m.language}`))
    .map((m) => {
      const body = m.components?.find((c) => c.type === "BODY")?.text ?? "";
      const { count } = countVariables(body);
      return {
        tenantId,
        name: m.name,
        language: m.language,
        category: m.category === "UTILITY" ? "UTILITY" : "MARKETING",
        body,
        variables: Array.from({ length: count }, (_, i) => `custom:var${i + 1}`),
        metaStatus: m.status,
        metaTemplateId: m.id,
      };
    })
    .filter((t) => t.body);
  if (fresh.length) await db.insert(waTemplates).values(fresh);
  revalidatePath(PATH);
  return { ok: fresh.length ? `Imported ${fresh.length} approved template${fresh.length === 1 ? "" : "s"}` : "No new approved templates found on Meta" };
}

export async function deleteTemplate(id: string) {
  const { tenantId } = await requireTenant();
  if (!isUuid(id)) return { error: "Invalid template" };
  const [t] = await db.select().from(waTemplates).where(and(eq(waTemplates.id, id), eq(waTemplates.tenantId, tenantId)));
  if (!t) return { error: "Template not found" };
  if (t.metaStatus !== "draft" && t.metaStatus !== "DELETED") {
    const cfg = await metaConfig(tenantId);
    if (!cfg) return { error: NOT_CONNECTED };
    const r = await metaDeleteTemplate(cfg, t.name, t.metaTemplateId);
    // Already gone at Meta → fine to remove locally; any other error keeps the row so the user sees it.
    if (r.error && !/not (be )?found|does not exist|doesn't exist/i.test(r.error)) return { error: `Meta: ${r.error}` };
  }
  await db.delete(waTemplates).where(and(eq(waTemplates.id, t.id), eq(waTemplates.tenantId, tenantId)));
  revalidatePath(PATH);
  return { ok: "Deleted" };
}
