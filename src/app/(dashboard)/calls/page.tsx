import Link from "next/link";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { calls, campaigns, campaignRecipients, leads } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { listAgents } from "@/lib/agents";
import { getIntegration } from "@/lib/integrations";
import { Badge, Card, Empty, Input, Label, PageHeader, Table } from "@/components/ui";
import { ActionForm } from "./action-form";
import { callNow } from "./actions";
import { NewCampaignForm } from "./new-campaign-form";
import { CallNowFields } from "./call-now-fields";
import { extractVariables } from "@/lib/agent/variables";
import { statusTone, fmtDuration } from "./ui-helpers";

export default async function CallsPage() {
  const { tenantId } = await requireTenant();
  const [twilio, agentRows, log, camps, leadOpts] = await Promise.all([
    getIntegration(tenantId, "twilio"),
    listAgents(tenantId),
    db.select().from(calls).where(eq(calls.tenantId, tenantId)).orderBy(desc(calls.createdAt)).limit(100),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        createdAt: campaigns.createdAt,
        total: sql<number>`(select count(*)::int from ${campaignRecipients} r where r.campaign_id = ${campaigns.id})`,
        done: sql<number>`(select count(*)::int from ${campaignRecipients} r where r.campaign_id = ${campaigns.id} and r.status in ('completed','failed'))`,
      })
      .from(campaigns)
      .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.type, "call")))
      .orderBy(desc(campaigns.createdAt)),
    db
      .select({ id: leads.id, name: leads.name, phone: leads.phone, status: leads.status })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), isNotNull(leads.phone), ne(leads.phone, "")))
      .orderBy(desc(leads.createdAt))
      .limit(2000),
  ]);
  const voiceAgents = agentRows.filter((a) => a.voiceEnabled);
  const agentOpts = (voiceAgents.length ? voiceAgents : agentRows).map((a) => ({ id: a.id, label: `${a.agentName} · ${a.phoneNumber || twilio?.phoneNumber || "no number"}${a.voiceEnabled ? "" : " (voice off)"}` }));
  const callAgentOpts = (voiceAgents.length ? voiceAgents : agentRows).map((a) => ({
    id: a.id,
    label: agentOpts.find((o) => o.id === a.id)?.label ?? a.agentName,
    variables: extractVariables(a.basePrompt, a.greeting),
  }));
  const agentName = new Map(agentRows.map((a) => [a.id, a.agentName]));
  const blocker = !twilio ? "Twilio is not connected — connect it in Integrations to make or receive calls." : !voiceAgents.length ? "No agent has voice enabled — turn it on in Agents → Channels and assign a phone number." : null;

  return (
    <div className="space-y-8">
      <PageHeader title="Calls" description="AI voice agent call log, quick calls and outbound call campaigns." />
      {blocker && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{blocker}</div>}
      {twilio && (
        <p className="text-sm text-zinc-500">
          Each agent answers and calls from its own number (set in Agents → Channels). All calls are recorded; play them from the call log below.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold text-zinc-900">Call a single number now</h2>
          <ActionForm action={callNow} submit="Call now" className="space-y-4">
            <CallNowFields agents={callAgentOpts} />
            <div>
              <Label hint="E.164">Phone number</Label>
              <Input name="to" required placeholder="+919876543210" />
            </div>
            <div>
              <Label>Objective</Label>
              <Input name="objective" placeholder="Remind them about tomorrow's appointment" />
            </div>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold text-zinc-900">New call campaign</h2>
          <NewCampaignForm leads={leadOpts} agents={agentOpts} />
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-zinc-900">Call campaigns</h2>
        {camps.length === 0 ? (
          <Empty>No call campaigns yet.</Empty>
        ) : (
          <Table head={["Name", "Status", "Progress", "Created"]}>
            {camps.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/calls/campaigns/${c.id}`} className="font-medium text-zinc-900 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </td>
                <td className="text-zinc-600">
                  {c.done}/{c.total}
                </td>
                <td className="text-zinc-500">{c.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-zinc-900">Call log</h2>
        {log.length === 0 ? (
          <Empty>No calls yet.</Empty>
        ) : (
          <Table head={["When", "Agent", "Direction", "From", "To", "Status", "Duration", "Recording", ""]}>
            {log.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap text-zinc-500">{c.createdAt.toLocaleString()}</td>
                <td className="whitespace-nowrap text-zinc-700">{(c.agentId && agentName.get(c.agentId)) || "—"}</td>
                <td>
                  <Badge tone={c.direction === "inbound" ? "blue" : "zinc"}>{c.direction}</Badge>
                </td>
                <td className="font-mono text-xs">{c.fromNumber}</td>
                <td className="font-mono text-xs">{c.toNumber}</td>
                <td>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </td>
                <td className="text-zinc-600">{fmtDuration(c.durationSec)}</td>
                <td className="min-w-64">
                  {c.recordingUrl ? (
                    <div className="flex items-center gap-2">
                      <audio controls preload="none" src={`/api/calls/${c.id}/recording`} className="h-8 w-56" />
                      <a href={`/api/calls/${c.id}/recording?download=1`} className="text-xs text-zinc-500 underline">
                        Download
                      </a>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400">{["completed", "in-progress"].includes(c.status) ? "Processing…" : "—"}</span>
                  )}
                </td>
                <td>
                  {c.conversationId && (
                    <Link href={`/conversations/${c.conversationId}`} className="text-sm text-zinc-700 underline">
                      Transcript
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
