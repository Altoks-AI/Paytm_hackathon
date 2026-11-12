import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentTools, type ToolParam } from "@/db/schema";
import { decryptJson, encryptJson } from "@/lib/crypto";
import type { ToolDef } from "@/lib/llm";

/** Built-in tools a tenant can switch on/off (agent_settings.disabledTools holds the ones that are off). */
export const BUILTIN_TOOLS = [
  { name: "book_appointment", label: "Book appointment", description: "Book appointments for customers" },
  { name: "check_appointments", label: "Check appointments", description: "Look up a customer's upcoming appointments" },
  { name: "cancel_appointment", label: "Cancel appointment", description: "Cancel an existing appointment" },
  { name: "capture_lead", label: "Capture lead", description: "Save customer contact details to Leads" },
  { name: "request_handoff", label: "Human handoff", description: "Transfer the call / raise a handoff to your team" },
  { name: "end_conversation", label: "End call / conversation", description: "Let the agent hang up or close the chat when finished" },
] as const;

export const TOOL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type CustomTool = typeof agentTools.$inferSelect;
export type CustomToolInput = {
  name: string;
  description: string;
  method: string;
  url: string;
  /** undefined = keep the stored headers (when editing) */
  headers?: Record<string, string>;
  parameters: ToolParam[];
  enabled?: boolean;
};

const toName = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);

function isPrivateHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
  );
}

function checkUrl(raw: string): string | null {
  try {
    const u = new URL(raw.replace(/\{[a-z0-9_]+\}/gi, "x"));
    if (u.protocol !== "https:" && u.protocol !== "http:") return "URL must start with http(s)://";
    if (isPrivateHost(u.hostname)) return "URL must be a public address";
    return null;
  } catch {
    return "Enter a valid URL";
  }
}

/** Validate + normalise a tool definition. Returns { error } or { value }. */
export function validateTool(input: CustomToolInput): { error: string } | { value: CustomToolInput } {
  const name = toName(input.name);
  if (!name) return { error: "Tool name is required" };
  if (BUILTIN_TOOLS.some((b) => b.name === name)) return { error: `"${name}" is a built-in tool name` };
  if (input.description.trim().length < 10) return { error: "Describe when the agent should use this tool (10+ characters)" };
  const method = input.method.toUpperCase();
  if (!TOOL_METHODS.includes(method as (typeof TOOL_METHODS)[number])) return { error: "Invalid HTTP method" };
  const urlError = checkUrl(input.url.trim());
  if (urlError) return { error: urlError };
  const parameters: ToolParam[] = [];
  for (const p of input.parameters) {
    const pn = toName(p.name);
    if (!pn) continue;
    if (parameters.some((x) => x.name === pn)) return { error: `Duplicate parameter "${pn}"` };
    parameters.push({ name: pn, type: ["number", "boolean"].includes(p.type) ? p.type : "string", description: (p.description || "").trim(), required: !!p.required });
  }
  const headers = input.headers && Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k.trim(), String(v).trim()]).filter(([k, v]) => k && v));
  return { value: { name, description: input.description.trim(), method, url: input.url.trim(), headers, parameters, enabled: input.enabled ?? true } };
}

/** Create (no id) or update (id) a tenant's tool. Returns an error string or null. */
export async function saveCustomTool(tenantId: string, input: CustomToolInput, id?: string): Promise<string | null> {
  const v = validateTool(input);
  if ("error" in v) return v.error;
  const { headers, ...rest } = v.value;
  const row = { ...rest, enabled: rest.enabled ?? true, ...(headers ? { headersEncrypted: Object.keys(headers).length ? encryptJson(headers) : null } : {}) };
  try {
    if (id) await db.update(agentTools).set(row).where(and(eq(agentTools.id, id), eq(agentTools.tenantId, tenantId)));
    else await db.insert(agentTools).values({ tenantId, ...row });
    return null;
  } catch (e) {
    return String(e).includes("agent_tools_tenant_name") ? "A tool with this name already exists" : "Could not save the tool";
  }
}

export const listCustomTools = (tenantId: string) => db.select().from(agentTools).where(eq(agentTools.tenantId, tenantId)).orderBy(agentTools.createdAt);

/** Header names only (values are secret) — for showing in the UI. */
export function headerNames(tool: CustomTool): string[] {
  try {
    return tool.headersEncrypted ? Object.keys(decryptJson(tool.headersEncrypted)) : [];
  } catch {
    return [];
  }
}

export function toToolDef(t: CustomTool): ToolDef {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(t.parameters.map((p) => [p.name, { type: p.type, description: p.description }])),
        required: t.parameters.filter((p) => p.required).map((p) => p.name),
      },
    },
  };
}

/** Call the tenant's endpoint. {param} placeholders fill the URL path; the rest go to the query (GET/DELETE) or JSON body. */
export async function callCustomTool(t: CustomTool, args: Record<string, unknown>, meta: { channel: string; conversationId: string; customerPhone?: string | null }): Promise<string> {
  const rest: Record<string, unknown> = { ...args };
  const url = new URL(
    t.url.replace(/\{([a-z0-9_]+)\}/gi, (_, k: string) => {
      const v = rest[k];
      delete rest[k];
      return encodeURIComponent(String(v ?? ""));
    })
  );
  if (isPrivateHost(url.hostname)) return JSON.stringify({ error: "Tool URL is not allowed" });
  const bodyless = t.method === "GET" || t.method === "DELETE";
  if (bodyless) for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  let headers: Record<string, string> = {};
  try {
    if (t.headersEncrypted) headers = decryptJson(t.headersEncrypted);
  } catch {
    /* ignore bad headers */
  }
  try {
    const res = await fetch(url, {
      method: t.method,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { ...(bodyless ? {} : { "Content-Type": "application/json" }), "X-Agent-Channel": meta.channel, "X-Conversation-Id": meta.conversationId, ...(meta.customerPhone ? { "X-Customer-Phone": meta.customerPhone } : {}), ...headers },
      body: bodyless ? undefined : JSON.stringify(rest),
    });
    const text = (await res.text()).slice(0, 4000);
    return res.ok ? text || JSON.stringify({ ok: true }) : JSON.stringify({ error: `Endpoint returned ${res.status}`, body: text.slice(0, 500) });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error && e.name === "TimeoutError" ? "The endpoint timed out" : "Could not reach the endpoint" });
  }
}
