import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { calls, campaigns, campaignRecipients, leads } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { Badge, Card, Empty, PageHeader, Table } from "@/components/ui";
import { ActionForm } from "../../action-form";
import { pauseCallCampaign, retryFailed, startCallCampaign } from "../../actions";
import { statusTone } from "../../ui-helpers";

export default async function CallCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId } = await requireTenant();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId), eq(campaigns.type, "call")));
  if (!campaign) notFound();

  const rows = await db
    .select({
      id: campaignRecipients.id,
      status: campaignRecipients.status,
      error: campaignRecipients.error,
      updatedAt: campaignRecipients.updatedAt,
      name: leads.name,
      phone: leads.phone,
      conversationId: calls.conversationId,
    })
    .from(campaignRecipients)
    .innerJoin(leads, eq(leads.id, campaignRecipients.leadId))
    .leftJoin(calls, and(eq(calls.callSid, campaignRecipients.externalId), eq(calls.tenantId, tenantId)))
    .where(and(eq(campaignRecipients.campaignId, id), eq(campaignRecipients.tenantId, tenantId)))
    .orderBy(asc(leads.name));

  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  const hidden = <input type="hidden" name="campaignId" value={campaign.id} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`Call campaign · created ${campaign.createdAt.toLocaleString()}`}
        action={
          <Link href="/calls" className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:underline">
            <ArrowLeft size={14} strokeWidth={2} aria-hidden /> All calls
          </Link>
        }
      />
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
          {["pending", "sent", "completed", "failed"].map((s) => (
            <span key={s} className="text-sm text-zinc-600">
              {s}: <span className="font-medium">{counts[s] || 0}</span>
            </span>
          ))}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Objective</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{campaign.callObjective}</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <ActionForm action={startCallCampaign} submit={campaign.status === "draft" ? "Start" : "Continue"}>
            {hidden}
          </ActionForm>
          {campaign.status === "running" && (
            <ActionForm action={pauseCallCampaign} submit="Pause" variant="secondary">
              {hidden}
            </ActionForm>
          )}
          {(counts.failed || 0) > 0 && (
            <ActionForm action={retryFailed} submit="Retry failed" variant="secondary">
              {hidden}
            </ActionForm>
          )}
        </div>
        <p className="text-xs text-zinc-500">Calls are dialed in the background, at most 3 at a time. Refresh to see progress.</p>
      </Card>

      {rows.length === 0 ? (
        <Empty>No recipients.</Empty>
      ) : (
        <Table head={["Lead", "Phone", "Status", "Detail", "Updated", ""]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-medium text-zinc-900">{r.name || "Unnamed"}</td>
              <td className="font-mono text-xs">{r.phone}</td>
              <td>
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              </td>
              <td className="max-w-xs truncate text-zinc-500" title={r.error ?? ""}>
                {r.error}
              </td>
              <td className="whitespace-nowrap text-zinc-500">{r.updatedAt.toLocaleString()}</td>
              <td>
                {r.conversationId && (
                  <Link href={`/conversations/${r.conversationId}`} className="text-sm text-zinc-700 underline">
                    Transcript
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
