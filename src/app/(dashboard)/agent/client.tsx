"use client";

import { createContext, useActionState, useContext, useMemo, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Check, Copy, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Input, Label, Select, Textarea, Toggle } from "@/components/ui";
import { applyTemplate, createAgent, deleteAgent, deleteTool, duplicateAgent, saveTool, toggleTool } from "./actions";
import { AGENT_TEMPLATES } from "./templates";
import { LANGUAGES, VOICE_OPTIONS, type ClientTool, type FormState, type ModelOption, type ToolParamRow } from "./options";

/** The agent being edited; every form and action on the page is scoped to it. */
const AgentCtx = createContext("");
export function AgentScope({ agentId, children }: { agentId: string; children: ReactNode }) {
  return <AgentCtx.Provider value={agentId}>{children}</AgentCtx.Provider>;
}

/* ---------- agent switcher ---------- */

type AgentOpt = { id: string; name: string; phoneNumber: string | null };

export function AgentSwitcher({ agents, current, tab }: { agents: AgentOpt[]; current: string; tab: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const go = (id: string) => router.push(`/agent?agent=${id}${tab !== "general" ? `&tab=${tab}` : ""}`);
  const cur = agents.find((a) => a.id === current);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 sm:max-w-sm">
          <Label hint={`${agents.length} agent${agents.length === 1 ? "" : "s"}`}>Agent</Label>
          <Select value={current} onChange={(e) => go(e.target.value)} disabled={busy}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.phoneNumber ? ` · ${a.phoneNumber}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" onClick={() => setCreating((v) => !v)} disabled={busy}>
          <Plus size={16} strokeWidth={2} aria-hidden /> New agent
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => start(() => duplicateAgent(current))}>
          <Copy size={15} strokeWidth={2} aria-hidden /> Duplicate
        </Button>
        {agents.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            disabled={busy}
            onClick={() => confirm(`Delete "${cur?.name}"? Its knowledge base, webhook tools and widget key are deleted too.`) && start(() => deleteAgent(current))}
          >
            <Trash2 size={15} strokeWidth={2} aria-hidden /> Delete
          </Button>
        )}
      </div>
      {creating && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="mb-3 text-sm font-medium text-zinc-900">Create a new agent</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[{ id: null, name: "Blank agent", tagline: "Start from scratch" }, ...AGENT_TEMPLATES].map((t) => (
              <button
                key={t.id ?? "blank"}
                type="button"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const id = await createAgent(t.id);
                    setCreating(false);
                    if (id) go(id);
                  })
                }
                className="rounded-lg border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-900 disabled:opacity-50"
              >
                <span className="block text-sm font-medium text-zinc-900">{t.name}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">{t.tagline}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SubmitButton({ children, pendingText, ...p }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || p.disabled} {...p}>
      {pending ? pendingText ?? "Saving…" : children}
    </Button>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

export function ConfirmButton({ message, children, ...p }: ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      {...p}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}

function Status({ state }: { state: FormState }) {
  if (state.error) return <span className="text-sm text-red-600">{state.error}</span>;
  if (state.ok) return <span key={state.at} className="inline-flex items-center gap-1 text-sm text-emerald-600">Saved <Check size={14} strokeWidth={2} aria-hidden /></span>;
  return null;
}

/** A section form that saves independently and shows saved / error state next to its button. */
export function ActionForm({ action, children, submitLabel = "Save", extra, className }: { action: (s: FormState, f: FormData) => Promise<FormState>; children: ReactNode; submitLabel?: string; extra?: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, {});
  const agentId = useContext(AgentCtx);
  return (
    <form action={formAction} className={className ?? "space-y-5"}>
      <input type="hidden" name="agentId" value={agentId} />
      {children}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-100 pt-4">
        <Status state={state} />
        {extra}
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/* ---------- templates ---------- */

export function TemplatePicker() {
  const agentId = useContext(AgentCtx);
  const [busy, start] = useTransition();
  const [res, setRes] = useState<FormState & { id?: string }>({});
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-3">
        {AGENT_TEMPLATES.map((t) => (
          <div key={t.id} className="flex flex-col justify-between gap-3 rounded-lg border border-zinc-200 p-4">
            <div>
              <div className="text-sm font-medium text-zinc-900">{t.name}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{t.tagline}</div>
              <div className="mt-2 text-xs text-zinc-400">Telugu · Hindi · English</div>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (!confirm(`Apply "${t.name}"? This replaces your agent name, greeting, instructions, languages, voice and built-in tools. Your knowledge base, channels and webhook tools stay as they are.`)) return;
                start(async () => setRes({ ...(await applyTemplate(agentId, t.id)), id: t.id }));
              }}
            >
              {busy ? "Applying…" : res.ok && res.id === t.id ? "Applied" : "Use template"}
            </Button>
          </div>
        ))}
      </div>
      {res.error && <p className="mt-2 text-sm text-red-600">{res.error}</p>}
    </div>
  );
}

/* ---------- languages ---------- */

export function LanguagePicker({ language, extras }: { language: string; extras: string[] }) {
  const [def, setDef] = useState(LANGUAGES.some(([c]) => c === language) ? language : "en-IN");
  const [extra, setExtra] = useState<string[]>(extras);
  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Label>Default language</Label>
        <Select name="language" value={def} onChange={(e) => setDef(e.target.value)}>
          {LANGUAGES.map(([c, l]) => (
            <option key={c} value={c}>
              {l} ({c})
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label hint="the agent starts in the default language and switches when the customer speaks one of these">Additional languages</Label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.filter(([c]) => c !== def).map(([c, l]) => {
            const on = extra.includes(c);
            return (
              <label key={c} className={`cursor-pointer select-none rounded-full border px-3 py-1 text-sm transition ${on ? "border-zinc-900 bg-brand-600 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"}`}>
                <input type="checkbox" name="extraLanguages" value={c} checked={on} onChange={() => setExtra(on ? extra.filter((x) => x !== c) : [...extra, c])} className="sr-only" />
                {l}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- voice ---------- */

export function VoicePicker({ value }: { value: string }) {
  const [voice, setVoice] = useState(VOICE_OPTIONS.some((v) => v.id === value) ? value : VOICE_OPTIONS[0].id);
  return (
    <div>
      <Label hint="Sarvam Bulbul v4 Flash">Voice</Label>
      <div className="grid gap-3 sm:grid-cols-2">
        {VOICE_OPTIONS.map((v) => {
          const on = v.id === voice;
          return (
            <label key={v.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-4 transition ${on ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-400"}`}>
              <input type="radio" name="voice" value={v.id} checked={on} onChange={() => setVoice(v.id)} className="sr-only" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-900">{v.name}</span>
                <span className="block text-xs text-zinc-500">{v.style}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge tone={v.gender === "Female" ? "blue" : "zinc"}>{v.gender}</Badge>
                {on && <Check size={16} strokeWidth={2.25} aria-hidden className="text-zinc-900" />}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- model ---------- */

const fmtCtx = (n: number) => (n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n || "?"));
const fmtPrice = (m: ModelOption) => (m.prompt === null ? "" : m.prompt === 0 && m.completion === 0 ? "free" : `$${m.prompt} / $${m.completion ?? "?"} per M`);

export function ModelPicker({ models, value, temperature }: { models: ModelOption[] | null; value: string; temperature: number }) {
  const [model, setModel] = useState(value);
  const [q, setQ] = useState("");
  const [temp, setTemp] = useState(temperature);
  const list = useMemo(() => {
    if (!models) return [];
    const all = models.some((m) => m.id === value) ? models : [{ id: value, name: value, context: 0, prompt: null, completion: null }, ...models];
    const needle = q.trim().toLowerCase();
    return (needle ? all.filter((m) => m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle)) : all).slice(0, 80);
  }, [models, value, q]);
  const current = models?.find((m) => m.id === model);

  return (
    <div className="space-y-5">
      <input type="hidden" name="model" value={model} />
      {models ? (
        <div>
          <Label hint={`${models.length} tool-capable models from OpenRouter`}>LLM</Label>
          <div className="mb-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            Selected: <span className="font-medium text-zinc-900">{current?.name ?? model}</span> <code className="ml-1 text-xs text-zinc-500">{model}</code>
          </div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models, e.g. gpt, claude, gemini, llama…" />
          <div className="mt-2 max-h-72 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200">
            {list.length === 0 && <div className="p-3 text-sm text-zinc-500">No models match.</div>}
            {list.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${m.id === model ? "bg-brand-600 text-white" : "hover:bg-zinc-50"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className={`block truncate text-xs ${m.id === model ? "text-zinc-300" : "text-zinc-500"}`}>{m.id}</span>
                </span>
                <span className={`shrink-0 text-right text-xs ${m.id === model ? "text-zinc-300" : "text-zinc-500"}`}>
                  {m.context > 0 && <span className="block">{fmtCtx(m.context)} ctx</span>}
                  <span className="block">{fmtPrice(m)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-md">
          <Label hint="model list unavailable — enter an OpenRouter model id">LLM</Label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="openai/gpt-4o-mini" required />
        </div>
      )}
      <div className="max-w-md">
        <Label hint="lower = more focused, higher = more creative">
          Temperature <span className="ml-1 font-mono text-zinc-900">{temp.toFixed(1)}</span>
        </Label>
        <input type="range" name="temperature" min={0} max={1} step={0.1} value={temp} onChange={(e) => setTemp(Number(e.target.value))} className="w-full accent-brand-600" />
        <div className="flex justify-between text-xs text-zinc-400">
          <span>0 · deterministic</span>
          <span>1 · creative</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- custom webhook tools ---------- */

type HeaderRow = { key: string; value: string };
const blankParam = (): ToolParamRow => ({ name: "", type: "string", description: "", required: false });

function ToolEditor({ tool, methods, onClose }: { tool?: ClientTool; methods: readonly string[]; onClose: () => void }) {
  const [name, setName] = useState(tool?.name ?? "");
  const [description, setDescription] = useState(tool?.description ?? "");
  const [method, setMethod] = useState(tool?.method ?? "POST");
  const [url, setUrl] = useState(tool?.url ?? "");
  const [params, setParams] = useState<ToolParamRow[]>(tool?.parameters.length ? tool.parameters : []);
  const hasSaved = !!tool?.headerNames.length;
  const [replaceHeaders, setReplaceHeaders] = useState(!tool);
  const [headers, setHeaders] = useState<HeaderRow[]>(tool ? [] : [{ key: "", value: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const agentId = useContext(AgentCtx);

  const setParam = (i: number, patch: Partial<ToolParamRow>) => setParams(params.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setHeader = (i: number, patch: Partial<HeaderRow>) => setHeaders(headers.map((h, j) => (j === i ? { ...h, ...patch } : h)));

  const submit = () =>
    start(async () => {
      setError(null);
      const err = await saveTool(agentId, tool?.id ?? null, {
        name,
        description,
        method,
        url,
        parameters: params,
        enabled: tool?.enabled ?? true,
        headers: replaceHeaders ? Object.fromEntries(headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value])) : undefined,
      });
      if (err) setError(err);
      else onClose();
    });

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label hint="snake_case, e.g. check_order_status">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="check_order_status" />
        </div>
        <div className="flex gap-2">
          <div className="w-32 shrink-0">
            <Label>Method</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 flex-1">
            <Label>URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/orders/{order_id}" />
          </div>
        </div>
      </div>
      <p className="-mt-2 text-xs text-zinc-500">
        Use <code>{"{param}"}</code> placeholders in the URL path. Other parameters go to the query string for GET/DELETE, or the JSON body otherwise.
      </p>
      <div>
        <Label hint="when should the agent use this?">Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="min-h-0" placeholder="Use when the customer asks about the status of an existing order." />
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <Label className="mb-0" hint="stored encrypted, e.g. Authorization">
            Headers
          </Label>
          {tool && (
            <Button
              type="button"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setReplaceHeaders(!replaceHeaders);
                setHeaders(replaceHeaders ? [] : tool.headerNames.length ? tool.headerNames.map((k) => ({ key: k, value: "" })) : [{ key: "", value: "" }]);
              }}
            >
              {replaceHeaders ? "Keep saved headers" : hasSaved ? "Replace headers" : "Add headers"}
            </Button>
          )}
        </div>
        {!replaceHeaders ? (
          hasSaved ? (
            <div className="space-y-2">
              {tool!.headerNames.map((k) => (
                <div key={k} className="flex gap-2">
                  <Input value={k} disabled className="w-1/3" />
                  <Input value="" placeholder="Saved" disabled />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">No headers.</p>
          )
        ) : (
          <div className="space-y-2">
            {headers.map((h, i) => (
              <div key={i} className="flex gap-2">
                <Input value={h.key} onChange={(e) => setHeader(i, { key: e.target.value })} placeholder="Authorization" className="w-1/3" />
                <Input value={h.value} onChange={(e) => setHeader(i, { value: e.target.value })} placeholder="Bearer sk_live_…" type="password" autoComplete="off" />
                <Button type="button" variant="ghost" onClick={() => setHeaders(headers.filter((_, j) => j !== i))} aria-label="Remove header">
                  <X size={16} strokeWidth={2} aria-hidden />
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" className="h-8 text-xs" onClick={() => setHeaders([...headers, { key: "", value: "" }])}>
              <Plus size={14} strokeWidth={2} aria-hidden /> Header
            </Button>
            {tool && hasSaved && <p className="text-xs text-amber-700">Saving replaces all stored headers with the ones above.</p>}
          </div>
        )}
      </div>

      <div>
        <Label hint="what the agent must collect before calling">Parameters</Label>
        <div className="space-y-2">
          {params.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_7rem_2fr_auto_auto] sm:items-center">
              <Input value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} placeholder="order_id" />
              <Select value={p.type} onChange={(e) => setParam(i, { type: e.target.value as ToolParamRow["type"] })}>
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </Select>
              <Input value={p.description} onChange={(e) => setParam(i, { description: e.target.value })} placeholder="The order number the customer gives" />
              <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                <input type="checkbox" checked={p.required} onChange={(e) => setParam(i, { required: e.target.checked })} /> required
              </label>
              <Button type="button" variant="ghost" onClick={() => setParams(params.filter((_, j) => j !== i))} aria-label="Remove parameter">
                <X size={16} strokeWidth={2} aria-hidden />
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" className="h-8 text-xs" onClick={() => setParams([...params, blankParam()])}>
            <Plus size={14} strokeWidth={2} aria-hidden /> Parameter
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-3">
        {error && <span className="text-sm text-red-600">{error}</span>}
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : tool ? "Save tool" : "Create tool"}
        </Button>
      </div>
    </div>
  );
}

const methodTone = (m: string) => (m === "GET" ? "blue" : m === "DELETE" ? "red" : m === "POST" ? "green" : "amber");

export function CustomTools({ tools, methods }: { tools: ClientTool[]; methods: readonly string[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {tools.length === 0 && editing !== "new" && <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">No webhook tools yet. Let the agent call your own APIs — check order status, create tickets, look up stock…</div>}
      {tools.map((t) =>
        editing === t.id ? (
          <ToolEditor key={t.id} tool={t} methods={methods} onClose={() => setEditing(null)} />
        ) : (
          <div key={t.id} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <Badge tone={methodTone(t.method)}>{t.method}</Badge>
                <span className="min-w-0 truncate font-mono text-sm font-medium text-zinc-900">{t.name}</span>
                {t.headerNames.length > 0 && <Badge>{t.headerNames.length} header{t.headerNames.length > 1 ? "s" : ""}</Badge>}
              </div>
              <div className="mt-1 truncate font-mono text-xs text-zinc-500">{t.url}</div>
              <div className="mt-1 truncate text-xs text-zinc-500">{t.description}</div>
            </div>
            <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(t.id)}>
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => confirm(`Delete tool "${t.name}"?`) && start(() => deleteTool(t.id))}
            >
              Delete
            </Button>
            <Toggle checked={t.enabled} disabled={pending} onChange={(e) => start(() => toggleTool(t.id, e.target.checked))} aria-label="Enabled" />
            </div>
          </div>
        )
      )}
      {editing === "new" ? (
        <ToolEditor methods={methods} onClose={() => setEditing(null)} />
      ) : (
        <Button type="button" variant="secondary" onClick={() => setEditing("new")}>
          <Plus size={16} strokeWidth={2} aria-hidden /> Add webhook tool
        </Button>
      )}
    </div>
  );
}
