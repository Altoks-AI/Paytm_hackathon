import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, handoffs } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/agent/time";
import { Empty, PageHeader, Table } from "@/components/ui";
import { SubmitButton } from "../agent/client";
import { channelLabel } from "../conversations/format";
import { resolveHandoff } from "./actions";

export default function HandoffsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Loading…</div>}>
      <HandoffsContent />
    </Suspense>
  );
}

async function HandoffsContent() {
  const { tenantId } = await requireTenant();
  const rows = await db
    .select({ h: handoffs, c: conversations })
    .from(handoffs)
    .innerJoin(conversations, eq(conversations.id, handoffs.conversationId))
    .where(and(eq(handoffs.tenantId, tenantId), eq(handoffs.status, "pending")))
    .orderBy(desc(handoffs.createdAt))
    .limit(200);

  return (
    <div>
      <PageHeader title="Handoffs" description="Conversations where the AI asked a human to step in. Reply from the conversation, then resolve to hand back to the AI." />
      {rows.length === 0 ? (
        <Empty>No pending handoffs.</Empty>
      ) : (
        <Table head={["Customer", "Channel", "Reason", "Raised", ""]}>
          {rows.map(({ h, c }) => (
            <tr key={h.id}>
              <td className="font-medium text-zinc-900">{c.customerName || c.customerPhone || (c.channel === "chatbot" ? "Website visitor" : c.externalId)}</td>
              <td>{channelLabel(h.channel)}</td>
              <td className="max-w-md text-zinc-600">{h.reason || "—"}</td>
              <td className="whitespace-nowrap text-zinc-500">{formatDateTime(h.createdAt)}</td>
              <td>
                <div className="flex items-center justify-end gap-2">
                  <Link href={`/conversations/${c.id}`} className="text-sm font-medium text-zinc-900 hover:underline">
                    Open
                  </Link>
                  <form action={resolveHandoff.bind(null, h.id)}>
                    <SubmitButton variant="secondary" pendingText="…">
                      Resolve
                    </SubmitButton>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
