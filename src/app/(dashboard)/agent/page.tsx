import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrations, knowledgeItems, type Agent } from "@/db/schema";
import { appUrl, requireTenant } from "@/lib/tenant";
import { listAgents } from "@/lib/agents";
import { listTwilioNumbers } from "@/lib/voice/numbers";
import { listWhatsAppNumbers } from "@/lib/whatsapp-numbers";
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
import { ActionForm, AgentScope, AgentSwitcher, ConfirmButton, CopyButton, CustomTools, LanguagePicker, ModelPicker, SubmitButton, TemplatePicker, VoicePicker } from "./client";
import { getToolModels } from "./models";
import type { ClientTool } from "./options";

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
type SP = Promise<{ tab?: string; agent?: string }>;

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
  const all = await listAgents(tenantId);
  const settings = all.find((a) => a.id === sp.agent) ?? all[0];
  if (!settings) return <Empty>Could not load agent settings.</Empty>;
  const q = (k: string) => `/agent?agent=${settings.id}${k === "general" ? "" : `&tab=${k}`}`;

  return (
    <AgentScope agentId={settings.id}>
    <div className="space-y-6">
      <PageHeader title="AI Agents" description="Create several agents, each with its own persona, voice, tools, knowledge and phone number." />
      <AgentSwitcher agents={all.map((a) => ({ id: a.id, name: a.agentName, phoneNumber: a.phoneNumber }))} current={settings.id} tab={tab} />
      <nav className="-mt-2 flex gap-1 overflow-x-auto border-b border-zinc-200">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={q(k)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${k === tab ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "general" && (
        <div key={settings.updatedAt.getTime()} className="space-y-6">
          <Section title="Start from a template" description="Autofill the agent with a ready-made setup (Telugu first, Hindi and English optional), then customise anything below. Or skip this and build from scratch.">
            <TemplatePicker />
          </Section>
          <General s={settings} />
        </div>
      )}
      {tab === "voice" && <LanguagesVoice key={settings.updatedAt.getTime()} s={settings} />}
      {tab === "model" && <ModelTab s={settings} />}
      {tab === "tools" && <ToolsTab tenantId={tenantId} agentId={settings.id} disabled={settings.disabledTools} />}
      {tab === "knowledge" && <Knowledge tenantId={tenantId} agentId={settings.id} />}
      {tab === "channels" && <Channels tenantId={tenantId} s={settings} others={all.filter((a) => a.id !== settings.id)} />}
      {tab === "widget" && <Widget s={settings} />}
    </div>
    </AgentScope>
  );
}

type Settings = Agent;

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
        <VoicePicker value={s.voice} />
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

async function ToolsTab({ tenantId, agentId, disabled }: { tenantId: string; agentId: string; disabled: string[] }) {
  const rows = await listCustomTools(tenantId, agentId);
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

async function Knowledge({ tenantId, agentId }: { tenantId: string; agentId: string }) {
  const kb = await db.select().from(knowledgeItems).where(and(eq(knowledgeItems.tenantId, tenantId), eq(knowledgeItems.agentId, agentId))).orderBy(asc(knowledgeItems.createdAt));
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
        <input type="hidden" name="agentId" value={agentId} />
        <Input name="title" placeholder="Question or topic, e.g. What are your opening hours?" required />
        <Textarea name="content" placeholder="Answer / details" rows={3} required />
        <div className="flex justify-end">
          <SubmitButton pendingText="Adding…">Add item</SubmitButton>
        </div>
      </form>
    </Section>
  );
}

async function Channels({ tenantId, s, others }: { tenantId: string; s: Settings; others: Settings[] }) {
  const [conns, { numbers, error }, wa] = await Promise.all([
    db.select({ provider: integrations.provider }).from(integrations).where(and(eq(integrations.tenantId, tenantId), eq(integrations.enabled, true))),
    listTwilioNumbers(tenantId),
    listWhatsAppNumbers(tenantId),
  ]);
  const connected = new Set(conns.map((c) => c.provider));
  const owner = new Map(others.filter((a) => a.phoneNumber).map((a) => [a.phoneNumber as string, a.agentName]));
  const waOwner = new Map(others.filter((a) => a.whatsappPhoneNumberId).map((a) => [a.whatsappPhoneNumberId as string, a.agentName]));
  return (
    <Section title="Channels" description="Where this agent is live. Each phone number belongs to one agent: inbound calls to it reach this agent, and its outbound calls come from it.">
      <ActionForm action={saveChannels}>
        <div className="max-w-md">
          <Label hint="from your Twilio account">Phone number</Label>
          {connected.has("twilio") ? (
            <Select name="phoneNumber" defaultValue={s.phoneNumber ?? ""}>
              <option value="">No number assigned</option>
              {numbers.map((n) => {
                const by = owner.get(n.phoneNumber);
                return (
                  <option key={n.phoneNumber} value={n.phoneNumber} disabled={!!by}>
                    {n.phoneNumber}
                    {n.friendlyName && n.friendlyName !== n.phoneNumber ? ` · ${n.friendlyName}` : ""}
                    {by ? ` (used by ${by})` : ""}
                  </option>
                );
              })}
            </Select>
          ) : (
            <p className="text-sm text-amber-700">
              Twilio is not connected. <Link href="/integrations" className="underline">Connect it in Integrations</Link> to assign a number.
            </p>
          )}
          {error && <p className="mt-1 text-xs text-amber-700">Could not list numbers from Twilio: {error}</p>}
          <p className="mt-1 text-xs text-zinc-500">The number&apos;s incoming-call webhook is pointed at this app automatically when you save.</p>
        </div>
        <div className="max-w-md">
          <Label hint="from your WhatsApp Business Account">WhatsApp number</Label>
          {connected.has("meta_whatsapp") ? (
            <Select name="whatsappPhoneNumberId" defaultValue={s.whatsappPhoneNumberId ?? ""}>
              <option value="">No number assigned</option>
              {wa.numbers.map((n) => {
                const by = waOwner.get(n.id);
                return (
                  <option key={n.id} value={n.id} disabled={!!by}>
                    {n.display}
                    {n.name ? ` · ${n.name}` : ""}
                    {by ? ` (used by ${by})` : ""}
                  </option>
                );
              })}
            </Select>
          ) : (
            <p className="text-sm text-amber-700">
              WhatsApp is not connected. <Link href="/integrations" className="underline">Connect it in Integrations</Link> to assign a number.
            </p>
          )}
          {wa.error && <p className="mt-1 text-xs text-amber-700">Could not list numbers from WhatsApp: {wa.error}</p>}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <ToggleRow name="whatsappEnabled" label="WhatsApp" desc="Reply to messages on this agent's WhatsApp number" checked={s.whatsappEnabled} missing={connected.has("meta_whatsapp") ? undefined : "Meta WhatsApp"} />
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
          <Link href={`/agent?agent=${s.id}&tab=channels`}>
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
