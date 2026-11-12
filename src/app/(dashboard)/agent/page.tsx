import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrations, knowledgeItems } from "@/db/schema";
import { appUrl, getAgentSettings, requireTenant } from "@/lib/tenant";
import { ensureAgentSettings } from "@/lib/agent/settings";
import { BUILTIN_TOOLS, TOOL_METHODS, headerNames, listCustomTools } from "@/lib/agent/custom-tools";
import { Badge, Card, Empty, Input, Label, PageHeader, Select, Textarea, Toggle } from "@/components/ui";
import {
  addKnowledge,
  deleteKnowledge,
  regenerateWidgetKey,
  saveBuiltinTools,
  saveChannels,
  saveGeneral,
  saveLanguageVoice,
  saveModel,
  saveWidget,
  updateKnowledge,
} from "./actions";
import { ActionForm, ConfirmButton, CopyButton, CustomTools, LanguagePicker, ModelPicker, SubmitButton } from "./client";
import { getToolModels } from "./models";
import { ALL_VOICES, VOICES, type ClientTool } from "./options";

const TABS = [
  ["general", "General"],
  ["voice", "Languages & Voice"],
  ["model", "Model"],
  ["tools", "Tools"],
  ["knowledge", "Knowledge base"],
  ["channels", "Channels"],
  ["widget", "Widget"],
] as const;
type Tab = (typeof TABS)[number][0];
type SP = Promise<{ tab?: string }>;

export default function AgentPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Loading…</div>}>
      <AgentContent searchParams={searchParams} />
    </Suspense>
  );
}

function Section({ title, description, aside, children }: { title: string; description?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function ToggleRow({ name, label, desc, checked, missing }: { name: string; label: string; desc: string; checked: boolean; missing?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-900">{label}</div>
        <div className="text-xs text-zinc-500">{desc}</div>
        {missing && (
          <div className="mt-2 text-xs text-amber-700">
            {missing} is not connected.{" "}
            <Link href="/integrations" className="underline">
              Connect it in Integrations
            </Link>
          </div>
        )}
      </div>
      <Toggle name={name} defaultChecked={checked} />
    </div>
  );
}

async function AgentContent({ searchParams }: { searchParams: SP }) {
  const { tenantId } = await requireTenant();
  const sp = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "general";
  await ensureAgentSettings(tenantId);
  const settings = await getAgentSettings(tenantId);
  if (!settings) return <Empty>Could not load agent settings.</Empty>;

  return (
    <div className="space-y-6">
      <PageHeader title="AI Agent" description="One agent for WhatsApp, voice calls and your website chat widget." />
      <nav className="-mt-2 flex gap-1 overflow-x-auto border-b border-zinc-200">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={k === "general" ? "/agent" : `/agent?tab=${k}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${k === tab ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "general" && <General s={settings} />}
      {tab === "voice" && <LanguagesVoice s={settings} />}
      {tab === "model" && <ModelTab s={settings} />}
      {tab === "tools" && <ToolsTab tenantId={tenantId} disabled={settings.disabledTools} />}
      {tab === "knowledge" && <Knowledge tenantId={tenantId} />}
      {tab === "channels" && <Channels tenantId={tenantId} s={settings} />}
      {tab === "widget" && <Widget s={settings} />}
    </div>
  );
}

type Settings = NonNullable<Awaited<ReturnType<typeof getAgentSettings>>>;

function General({ s }: { s: Settings }) {
  return (
    <Section title="General" description="Identity and behaviour shared by every channel.">
      <ActionForm action={saveGeneral}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Agent name</Label>
            <Input name="agentName" defaultValue={s.agentName} required />
          </div>
          <div>
            <Label hint="calls are transferred here">Handoff phone</Label>
            <Input name="handoffPhone" defaultValue={s.handoffPhone ?? ""} placeholder="+919876543210" />
          </div>
        </div>
        <div>
          <Label hint="first message on calls and chats">Greeting</Label>
          <Input name="greeting" defaultValue={s.greeting} />
        </div>
        <div>
          <Label hint="system prompt, shared by all channels">Custom instructions</Label>
          <Textarea name="basePrompt" defaultValue={s.basePrompt} rows={10} placeholder="Tone, what to offer, what never to say, business hours, booking rules…" />
        </div>
      </ActionForm>
    </Section>
  );
}

function LanguagesVoice({ s }: { s: Settings }) {
  return (
    <Section title="Languages & Voice" description="The agent starts in the default language and switches when the customer speaks one of the additional languages.">
      <ActionForm action={saveLanguageVoice}>
        <LanguagePicker language={s.language} extras={s.extraLanguages} />
        <div className="max-w-xs">
          <Label hint="Sarvam TTS speaker">Voice</Label>
          <Select name="voice" defaultValue={ALL_VOICES.includes(s.voice) ? s.voice : "anushka"}>
            {Object.entries(VOICES).map(([model, voices]) => (
              <optgroup key={model} label={model}>
                {voices.map((v) => (
                  <option key={v} value={v}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
      </ActionForm>
    </Section>
  );
}

async function ModelTab({ s }: { s: Settings }) {
  const models = await getToolModels();
  return (
    <Section title="Model" description="The LLM that powers the agent (via OpenRouter). Only models that support tool calling are listed.">
      <ActionForm action={saveModel}>
        <ModelPicker models={models} value={s.model} temperature={s.temperature} />
      </ActionForm>
    </Section>
  );
}

async function ToolsTab({ tenantId, disabled }: { tenantId: string; disabled: string[] }) {
  const rows = await listCustomTools(tenantId);
  const tools: ClientTool[] = rows.map((t) => ({ id: t.id, name: t.name, description: t.description, method: t.method, url: t.url, parameters: t.parameters, enabled: t.enabled, headerNames: headerNames(t) }));
  return (
    <div className="space-y-6">
      <Section title="Built-in tools" description="Actions the agent can take on its own. Switch off anything you don't want it to do.">
        <ActionForm action={saveBuiltinTools}>
          <div className="grid gap-3 md:grid-cols-2">
            {BUILTIN_TOOLS.map((t) => (
              <div key={t.name} className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4">
                <div>
                  <div className="text-sm font-medium text-zinc-900">{t.label}</div>
                  <div className="text-xs text-zinc-500">{t.description}</div>
                </div>
                <Toggle name={`tool_${t.name}`} defaultChecked={!disabled.includes(t.name)} />
              </div>
            ))}
          </div>
        </ActionForm>
      </Section>
      <Section
        title="Webhook tools"
        description="Let the agent call your own HTTP endpoints. The agent decides when to call a tool from its description and collects the parameters from the customer."
        aside={<Badge>{tools.filter((t) => t.enabled).length} active</Badge>}
      >
        <CustomTools tools={tools} methods={TOOL_METHODS} />
      </Section>
    </div>
  );
}

async function Knowledge({ tenantId }: { tenantId: string }) {
  const kb = await db.select().from(knowledgeItems).where(eq(knowledgeItems.tenantId, tenantId)).orderBy(asc(knowledgeItems.createdAt));
  const kbChars = kb.reduce((n, k) => n + k.title.length + k.content.length, 0);
  return (
    <Section
      title="Knowledge base"
      description="FAQs and facts the agent may answer from. It never invents anything beyond these and your company profile."
      aside={<Badge tone={kbChars > 12000 ? "amber" : "zinc"}>{kbChars.toLocaleString()} / 12,000 chars</Badge>}
    >
      {kb.length === 0 ? (
        <Empty>No knowledge items yet. Add your FAQs, pricing, hours, policies…</Empty>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {kb.map((k) => (
            <details key={k.id} className="group p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-900">{k.title}</div>
                  <div className="truncate text-xs text-zinc-500">{k.content}</div>
                </div>
                <span className="text-xs text-zinc-400 group-open:hidden">Edit</span>
              </summary>
              <form action={updateKnowledge.bind(null, k.id)} className="mt-3 space-y-3">
                <Input name="title" defaultValue={k.title} required />
                <Textarea name="content" defaultValue={k.content} rows={4} required />
                <div className="flex justify-end gap-2">
                  <ConfirmButton variant="ghost" formAction={deleteKnowledge.bind(null, k.id)} message="Delete this item?">
                    Delete
                  </ConfirmButton>
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </div>
              </form>
            </details>
          ))}
        </div>
      )}
      <form action={addKnowledge} className="space-y-3 rounded-lg bg-zinc-50 p-4">
        <Input name="title" placeholder="Question or topic, e.g. What are your opening hours?" required />
        <Textarea name="content" placeholder="Answer / details" rows={3} required />
        <div className="flex justify-end">
          <SubmitButton pendingText="Adding…">Add item</SubmitButton>
        </div>
      </form>
    </Section>
  );
}

async function Channels({ tenantId, s }: { tenantId: string; s: Settings }) {
  const conns = await db.select({ provider: integrations.provider }).from(integrations).where(and(eq(integrations.tenantId, tenantId), eq(integrations.enabled, true)));
  const connected = new Set(conns.map((c) => c.provider));
  return (
    <Section title="Channels" description="Where the agent is live.">
      <ActionForm action={saveChannels}>
        <div className="grid gap-3 md:grid-cols-3">
          <ToggleRow name="whatsappEnabled" label="WhatsApp" desc="Reply to inbound WhatsApp messages" checked={s.whatsappEnabled} missing={connected.has("meta_whatsapp") ? undefined : "Meta WhatsApp"} />
          <ToggleRow name="voiceEnabled" label="Voice calls" desc="Answer and place phone calls" checked={s.voiceEnabled} missing={connected.has("twilio") ? undefined : "Twilio"} />
          <ToggleRow name="chatbotEnabled" label="Website chatbot" desc="Embeddable chat widget" checked={s.chatbotEnabled} />
        </div>
      </ActionForm>
    </Section>
  );
}

function Widget({ s }: { s: Settings }) {
  const snippet = `<script src="${appUrl()}/widget.js" data-key="${s.widgetKey}" async></script>`;
  return (
    <Section
      title="Website chat widget"
      description={
        <>
          Paste this snippet before <code>&lt;/body&gt;</code> on your website.
        </>
      }
      aside={
        s.chatbotEnabled ? (
          <Badge tone="green">Enabled</Badge>
        ) : (
          <Link href="/agent?tab=channels">
            <Badge tone="amber">Disabled — enable in Channels</Badge>
          </Link>
        )
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-brand-600 p-3 text-xs text-zinc-100">{snippet}</pre>
        <CopyButton text={snippet} />
      </div>
      <ActionForm
        action={saveWidget}
        submitLabel="Save color"
        extra={
          <ConfirmButton variant="ghost" formAction={regenerateWidgetKey} message="Regenerate the key? The old snippet will stop working.">
            Regenerate key
          </ConfirmButton>
        }
      >
        <div>
          <Label>Widget color</Label>
          <input type="color" name="widgetColor" defaultValue={s.widgetColor} className="h-9 w-16 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1" />
        </div>
      </ActionForm>
    </Section>
  );
}
