import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignRecipients, waTemplates } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { Badge, Empty, Table } from "@/components/ui";
import { linkBtn } from "../../leads/_components/styles";
import { campaignTone } from "../_components/tone";

export default function CampaignsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <Campaigns />
    </Suspense>
  );
}

const n = (status: string) => sql<number>`count(*) filter (where ${campaignRecipients.status} = ${status})::int`;

async function Campaigns() {
  const { tenantId } = await requireTenant();
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
      template: waTemplates.name,
      total: sql<number>`count(${campaignRecipients.id})::int`,
      sent: sql<number>`count(*) filter (where ${campaignRecipients.status} in ('sent','delivered'))::int`,
      delivered: n("delivered"),
      failed: n("failed"),
    })
    .from(campaigns)
    .leftJoin(waTemplates, eq(waTemplates.id, campaigns.templateId))
    .leftJoin(campaignRecipients, eq(campaignRecipients.campaignId, campaigns.id))
    .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.type, "whatsapp")))
    .groupBy(campaigns.id, waTemplates.name)
    .orderBy(desc(campaigns.createdAt));

  return (
    <div className="space-y-4">
      <Link href="/whatsapp/campaigns/new" className={linkBtn}>New campaign</Link>
      {rows.length === 0 ? (
        <Empty>No campaigns yet. Broadcast an approved template to your leads.</Empty>
      ) : (
        <Table head={["Campaign", "Template", "Status", "Recipients", "Sent", "Delivered", "Failed", "Created"]}>
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-zinc-50">
              <td><Link href={`/whatsapp/campaigns/${c.id}`} className="font-medium text-zinc-900 hover:underline">{c.name}</Link></td>
              <td className="font-mono text-xs">{c.template ?? "—"}</td>
              <td><Badge tone={campaignTone(c.status)}>{c.status}</Badge></td>
              <td>{c.total}</td>
              <td>{c.sent}</td>
              <td>{c.delivered}</td>
              <td className={c.failed ? "text-red-600" : ""}>{c.failed}</td>
              <td className="text-zinc-500">{c.createdAt.toLocaleDateString()}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
