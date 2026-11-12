import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignRecipients, leads, waTemplates } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { isUuid } from "@/lib/leads";
import { isCampaignRunning, recipientCounts } from "@/lib/wa-campaigns";
import { Badge, Card, Empty, Select, Table, Button } from "@/components/ui";
import { ActionButton } from "../../../leads/_components/action-button";
import { AutoRefresh } from "../../_components/auto-refresh";
import { campaignTone, recipientTone } from "../../_components/tone";
import { NOT_CONNECTED, metaConfig } from "../../_components/meta";
import { deleteCampaign, startCampaign } from "../actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const PER_PAGE = 100;
const RSTATUSES = ["pending", "sent", "delivered", "failed"];

export default function CampaignPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <Campaign {...props} />
    </Suspense>
  );
}

async function Campaign({ params, searchParams }: Props) {
  const { tenantId } = await requireTenant();
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const [c] = await db
    .select({ c: campaigns, template: waTemplates.name, templateStatus: waTemplates.metaStatus })
    .from(campaigns)
    .leftJoin(waTemplates, eq(waTemplates.id, campaigns.templateId))
    .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId), eq(campaigns.type, "whatsapp")));
  if (!c) notFound();

  const filter = typeof sp.status === "string" && RSTATUSES.includes(sp.status) ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const where = and(eq(campaignRecipients.tenantId, tenantId), eq(campaignRecipients.campaignId, id), filter ? eq(campaignRecipients.status, filter) : undefined);
  const [counts, rows, [{ total }], cfg] = await Promise.all([
    recipientCounts(tenantId, id),
    db.select({ id: campaignRecipients.id, status: campaignRecipients.status, error: campaignRecipients.error, updatedAt: campaignRecipients.updatedAt, name: leads.name, phone: leads.phone })
      .from(campaignRecipients)
      .innerJoin(leads, eq(leads.id, campaignRecipients.leadId))
      .where(where)
      .orderBy(asc(campaignRecipients.status), asc(leads.name))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(campaignRecipients).where(where),
    metaConfig(tenantId),
  ]);
  const sending = isCampaignRunning(id);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (p: number) => `?${new URLSearchParams({ ...(filter && { status: filter }), page: String(p) })}`;
  const stats: [string, number, string][] = [
    ["Recipients", counts.total, "text-zinc-900"],
    ["Pending", counts.pending, "text-zinc-600"],
    ["Sent", counts.sent, "text-sky-800"],
    ["Delivered", counts.delivered, "text-emerald-700"],
    ["Failed", counts.failed, "text-red-600"],
  ];

  return (
    <div className="space-y-5">
      <AutoRefresh active={sending || c.c.status === "running"} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/whatsapp/campaigns" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"><ArrowLeft size={14} strokeWidth={2} aria-hidden /> Campaigns</Link>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 break-words text-lg font-semibold text-zinc-900">
            {c.c.name} <Badge tone={campaignTone(c.c.status)}>{sending ? "sending" : c.c.status}</Badge>
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Template <span className="break-all font-mono">{c.template ?? "deleted"}</span>
            {c.templateStatus && c.templateStatus !== "APPROVED" && <span className="text-red-600"> ({c.templateStatus})</span>} · Audience: {c.c.audience} · Created {c.c.createdAt.toLocaleString()}
          </p>
          {Object.keys(c.c.customValues).length > 0 && (
            <p className="mt-1 text-xs text-zinc-400">{Object.entries(c.c.customValues).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {!sending && counts.pending > 0 && (
            <ActionButton action={startCampaign.bind(null, id)} variant="primary" pendingLabel="Starting…" confirm={c.c.status === "draft" ? `Send this template to ${counts.pending} recipient(s)?` : undefined}>
              {c.c.status === "draft" ? `Send to ${counts.pending}` : `Resume (${counts.pending} pending)`}
            </ActionButton>
          )}
          {sending && <Button disabled>Sending…</Button>}
          {!sending && <ActionButton action={deleteCampaign.bind(null, id)} variant="ghost" confirm="Delete this campaign and its recipient log?">Delete</ActionButton>}
        </div>
      </div>
      {!cfg && counts.pending > 0 && <Card className="border-amber-200 bg-amber-50 text-sm text-amber-800">{NOT_CONNECTED}</Card>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, value, color]) => (
          <Card key={label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
            <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <Select name="status" defaultValue={filter} className="w-44">
          <option value="">All recipients</option>
          {RSTATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Button variant="secondary">Filter</Button>
      </form>

      {rows.length === 0 ? (
        <Empty>No recipients{filter ? ` with status “${filter}”` : ""}.</Empty>
      ) : (
        <Table head={["Name", "Phone", "Status", "Error", "Updated"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name || <span className="text-zinc-400">—</span>}</td>
              <td className="font-mono text-xs">{r.phone}</td>
              <td><Badge tone={recipientTone(r.status)}>{r.status}</Badge></td>
              <td className="max-w-md text-xs text-red-600">{r.error}</td>
              <td className="text-xs text-zinc-500">{r.status === "pending" ? "" : r.updatedAt.toLocaleString()}</td>
            </tr>
          ))}
        </Table>
      )}
      {pages > 1 && (
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-zinc-500">
          {page > 1 && <Link href={href(page - 1)} className="inline-flex h-9 items-center gap-1 hover:text-zinc-900"><ArrowLeft size={14} strokeWidth={2} aria-hidden /> Prev</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link href={href(page + 1)} className="inline-flex h-9 items-center gap-1 hover:text-zinc-900">Next <ArrowRight size={14} strokeWidth={2} aria-hidden /></Link>}
        </div>
      )}
    </div>
  );
}
