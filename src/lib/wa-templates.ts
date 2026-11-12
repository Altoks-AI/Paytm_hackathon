// Isomorphic helpers (safe to import from client components) + Meta Graph API calls (server use; config passed in).

// v21.0 expires 2027-01-21; v25.0 is supported until 2028-07-29 (developers.facebook.com/docs/graph-api/changelog/versions).
export const META_GRAPH_VERSION = "v25.0";
export const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const LANGUAGES = ["en", "en_US", "en_GB", "hi", "mr", "ta", "te", "kn", "ml", "bn", "gu", "pa", "ur"];
export const LEAD_FIELDS = ["lead.name", "lead.phone", "lead.email"] as const;

type MetaCfg = { wabaId: string; accessToken: string };

export function toTemplateName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 512);
}

/** Number of {{n}} variables; error if they aren't sequential 1..n. */
export function countVariables(body: string): { count: number; error?: string } {
  const nums = [...new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  const ok = nums.every((n, i) => n === i + 1);
  return { count: nums.length ? nums[nums.length - 1] : 0, error: ok ? undefined : "Variables must be numbered sequentially: {{1}}, {{2}}, …" };
}

export function customLabel(mapping: string) {
  return mapping.startsWith("custom:") ? mapping.slice(7) : null;
}

export function customLabels(variables: string[]) {
  return [...new Set(variables.map(customLabel).filter((l): l is string => !!l))];
}

export function renderBody(body: string, values: string[]) {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => values[Number(n) - 1] || m);
}

export function defaultSample(mapping: string) {
  if (mapping === "lead.name") return "Rahul";
  if (mapping === "lead.phone") return "+919876543210";
  if (mapping === "lead.email") return "rahul@example.com";
  return customLabel(mapping) || "value";
}

/** Resolve template params for one lead. Never returns empty strings (Meta rejects them). */
export function resolveParams(variables: string[], lead: { name: string | null; phone: string | null; email: string | null }, customValues: Record<string, string>) {
  return variables.map((v) => {
    if (v === "lead.name") return lead.name?.trim() || "there";
    if (v === "lead.phone") return lead.phone || "-";
    if (v === "lead.email") return lead.email || "-";
    const label = customLabel(v);
    return (label && customValues[label]?.trim()) || "-";
  });
}

function graphError(j: unknown, status: number) {
  const e = (j as { error?: { message?: string; error_user_title?: string; error_user_msg?: string } })?.error;
  if (!e) return `Meta API error (HTTP ${status})`;
  return e.error_user_msg ? `${e.error_user_title ? e.error_user_title + ": " : ""}${e.error_user_msg}` : e.message || `Meta API error (HTTP ${status})`;
}

async function graph<T>(url: string, token: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || (j && j.error)) return { error: graphError(j, res.status) };
    return { data: j as T };
  } catch (e) {
    return { error: `Could not reach Meta: ${(e as Error).message}` };
  }
}

export async function metaCreateTemplate(cfg: MetaCfg, t: { name: string; language: string; category: string; body: string; samples: string[] }) {
  const bodyComponent: Record<string, unknown> = { type: "BODY", text: t.body };
  if (t.samples.length) bodyComponent.example = { body_text: [t.samples] };
  return graph<{ id: string; status?: string }>(`${GRAPH}/${cfg.wabaId}/message_templates`, cfg.accessToken, {
    method: "POST",
    body: JSON.stringify({ name: t.name, language: t.language, category: t.category, components: [bodyComponent] }),
  });
}

export type MetaTemplate = { id: string; name: string; language: string; status: string; category: string; components?: { type: string; text?: string }[] };

export async function metaListTemplates(cfg: MetaCfg): Promise<{ data?: MetaTemplate[]; error?: string }> {
  const out: MetaTemplate[] = [];
  let url: string | undefined = `${GRAPH}/${cfg.wabaId}/message_templates?fields=id,name,language,status,category,components&limit=100`;
  for (let page = 0; url && page < 20; page++) {
    const r: { data?: { data: MetaTemplate[]; paging?: { next?: string } }; error?: string } = await graph(url, cfg.accessToken);
    if (r.error) return { error: r.error };
    out.push(...(r.data?.data ?? []));
    url = r.data?.paging?.next;
  }
  return { data: out };
}

/** Deleting by name alone removes every language version; hsm_id limits it to one template. */
export async function metaDeleteTemplate(cfg: MetaCfg, name: string, templateId?: string | null) {
  const q = new URLSearchParams({ name });
  if (templateId) q.set("hsm_id", templateId);
  return graph<{ success: boolean }>(`${GRAPH}/${cfg.wabaId}/message_templates?${q}`, cfg.accessToken, { method: "DELETE" });
}
