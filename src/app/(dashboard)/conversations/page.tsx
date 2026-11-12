import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { conversations, type Channel } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/agent/time";
import { channelLabel, statusTone } from "./format";
import { Badge, Button, Empty, PageHeader, Select, Table } from "@/components/ui";

const CHANNELS: Channel[] = ["whatsapp", "voice", "chatbot"];
const STATUSES = ["open", "handoff", "closed"];


type SP = Promise<{ channel?: string; status?: string }>;

export default function ConversationsPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Loading…</div>}>
      <ConversationsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ConversationsContent({ searchParams }: { searchParams: SP }) {
  const { tenantId } = await requireTenant();
  const sp = await searchParams;
  const channel = CHANNELS.includes(sp.channel as Channel) ? (sp.channel as Channel) : undefined;
  const status = STATUSES.includes(sp.status ?? "") ? sp.status : undefined;
  const where: SQL[] = [eq(conversations.tenantId, tenantId)];
  if (channel) where.push(eq(conversations.channel, channel));
  if (status) where.push(eq(conversations.status, status));
  const rows = await db.select().from(conversations).where(and(...where)).orderBy(desc(conversations.updatedAt)).limit(200);

  return (
    <div>
      <PageHeader title="Conversations" description="Every WhatsApp, voice and chatbot conversation handled by your agent." />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="channel" defaultValue={channel ?? ""} className="w-40">
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {channelLabel(c)}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} className="w-40">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {rows.length === 0 ? (
        <Empty>No conversations yet.</Empty>
      ) : (
        <Table head={["Customer", "Channel", "Status", "Last activity", ""]}>
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-zinc-50">
              <td>
                <div className="font-medium text-zinc-900">{c.customerName || c.customerPhone || (c.channel === "chatbot" ? "Website visitor" : c.externalId)}</div>
                {c.customerName && c.customerPhone && <div className="text-xs text-zinc-500">{c.customerPhone}</div>}
              </td>
              <td>{channelLabel(c.channel)}</td>
              <td>
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
              </td>
              <td className="text-zinc-500">{formatDateTime(c.updatedAt)}</td>
              <td className="text-right">
                <Link href={`/conversations/${c.id}`} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-zinc-900 hover:underline">
                  Open <ChevronRight size={14} strokeWidth={2} aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
