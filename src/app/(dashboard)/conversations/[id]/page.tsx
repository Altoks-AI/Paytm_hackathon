import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads, messages } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/agent/time";
import { Badge, Button, Card, Empty, PageHeader, Textarea } from "@/components/ui";
import { SubmitButton } from "../../agent/client";
import { channelLabel, statusTone } from "../format";
import { sendReply, setConversationStatus } from "../actions";
import { AutoRefresh } from "./refresher";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };

export default function ConversationPage(props: Props) {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Loading…</div>}>
      <ConversationContent {...props} />
    </Suspense>
  );
}

const roleStyle: Record<string, { label: string; cls: string; right?: boolean }> = {
  user: { label: "Customer", cls: "bg-white border border-zinc-200" },
  assistant: { label: "AI agent", cls: "bg-brand-600 text-white", right: true },
  human: { label: "Staff", cls: "bg-emerald-600 text-white", right: true },
  system: { label: "System", cls: "bg-zinc-100 text-zinc-600" },
};

async function ConversationContent({ params, searchParams }: Props) {
  const { tenantId } = await requireTenant();
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)));
  if (!conv) notFound();
  const [msgs, lead] = await Promise.all([
    db.select().from(messages).where(and(eq(messages.conversationId, id), eq(messages.tenantId, tenantId))).orderBy(asc(messages.createdAt)).limit(500),
    conv.leadId ? db.select().from(leads).where(and(eq(leads.id, conv.leadId), eq(leads.tenantId, tenantId))).then((r) => r[0]) : undefined,
  ]);
  const who = conv.customerName || conv.customerPhone || (conv.channel === "chatbot" ? "Website visitor" : conv.externalId);
  const setStatus = (s: "open" | "handoff" | "closed") => setConversationStatus.bind(null, id, s);

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <Link href="/conversations" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft size={14} strokeWidth={2} aria-hidden /> All conversations
      </Link>
      <PageHeader
        title={who}
        description={`${channelLabel(conv.channel)} · started ${formatDateTime(conv.createdAt)}${conv.customerPhone && conv.customerName ? ` · ${conv.customerPhone}` : ""}${lead ? ` · lead: ${lead.name || lead.phone || lead.email}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(conv.status)}>{conv.status}</Badge>
            <form className="flex flex-wrap gap-2">
              {conv.status === "open" && (
                <Button variant="secondary" formAction={setStatus("handoff")}>
                  Take over
                </Button>
              )}
              {conv.status !== "open" && (
                <Button variant="secondary" formAction={setStatus("open")}>
                  Return to AI
                </Button>
              )}
              {conv.status !== "closed" && (
                <Button variant="ghost" formAction={setStatus("closed")}>
                  Close
                </Button>
              )}
            </form>
          </div>
        }
      />

      {conv.status === "handoff" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">A human has taken over — the AI agent will not reply until you return it to AI.</div>
      )}

      <Card className="space-y-3 bg-zinc-50">
        {msgs.length === 0 ? (
          <Empty>No messages yet.</Empty>
        ) : (
          msgs.map((m) => {
            const r = roleStyle[m.role] ?? roleStyle.system;
            return (
              <div key={m.id} className={`flex flex-col ${r.right ? "items-end" : "items-start"}`}>
                <div className="mb-0.5 text-xs text-zinc-400">
                  {r.label} · {formatDateTime(m.createdAt)}
                </div>
                <div className={`max-w-[90%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl sm:max-w-[80%] px-3.5 py-2 text-sm ${r.cls}`}>{m.content}</div>
              </div>
            );
          })
        )}
      </Card>

      {conv.channel === "voice" ? (
        <p className="text-sm text-zinc-500">Voice call transcript — replies can&apos;t be sent from here.</p>
      ) : conv.status === "closed" ? (
        <p className="text-sm text-zinc-500">This conversation is closed. New customer messages will start a new conversation.</p>
      ) : (
        <form action={sendReply.bind(null, id)} className="space-y-2">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Textarea name="text" rows={3} required placeholder={conv.channel === "whatsapp" ? "Reply on WhatsApp as staff…" : "Reply in the website chat as staff…"} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">Sending a reply pauses the AI for this conversation.</span>
            <SubmitButton pendingText="Sending…">Send reply</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
