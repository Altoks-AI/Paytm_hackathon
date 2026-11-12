import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { LEAD_STATUSES } from "@/lib/leads";
import { Badge, Button, Empty, Input, PageHeader, Select, Table } from "@/components/ui";
import { leadWhere } from "./query";
import { linkBtn, linkBtnSecondary, statusTone } from "./_components/styles";

type SP = Promise<Record<string, string | string[] | undefined>>;
const PER_PAGE = 25;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function LeadsPage({ searchParams }: { searchParams: SP }) {
  return (
    <div>
      <PageHeader
        title="Leads"
        description="Contacts your agent and campaigns reach out to."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/leads/import" className={linkBtnSecondary}>Import CSV</Link>
            <Link href="/leads/new" className={linkBtn}>Add lead</Link>
          </div>
        }
      />
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <LeadsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LeadsTable({ searchParams }: { searchParams: SP }) {
  const { tenantId } = await requireTenant();
  const sp = await searchParams;
  const q = one(sp.q), status = one(sp.status), tag = one(sp.tag);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const where = leadWhere(tenantId, q, status, tag);
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(leads).where(where),
    db.select().from(leads).where(where).orderBy(desc(leads.createdAt)).limit(PER_PAGE).offset((page - 1) * PER_PAGE),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (p: number) => "?" + new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(tag && { tag }), page: String(p) }).toString();
  const exportQs = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(tag && { tag }) }).toString();

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name, phone, email" className="max-w-xs" />
        <Select name="status" defaultValue={status} className="w-40">
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Input name="tag" defaultValue={tag} placeholder="Tag" className="w-32" />
        <Button variant="secondary">Filter</Button>
        {(q || status || tag) && <Link href="/leads" className="text-sm text-zinc-500 hover:text-zinc-800">Clear</Link>}
        <a href={`/api/leads/export${exportQs ? "?" + exportQs : ""}`} className="ml-auto inline-flex h-9 items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-900">Export CSV <Download size={14} strokeWidth={2} aria-hidden /></a>
      </form>

      {rows.length === 0 ? (
        <Empty>{q || status || tag ? "No leads match these filters." : "No leads yet. Add one or import a CSV."}</Empty>
      ) : (
        <Table head={["Name", "Phone", "Email", "Status", "Tags", "Source", ""]}>
          {rows.map((l) => (
            <tr key={l.id} className="hover:bg-zinc-50">
              <td className="font-medium text-zinc-900">{l.name || <span className="text-zinc-400">—</span>}</td>
              <td className="font-mono text-xs">{l.phone ?? "—"}</td>
              <td>{l.email ?? "—"}</td>
              <td><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
              <td className="space-x-1">{l.tags.map((t) => <Badge key={t}>{t}</Badge>)}</td>
              <td className="text-zinc-500">{l.source}</td>
              <td className="text-right"><Link href={`/leads/${l.id}`} className="text-sm font-medium text-zinc-700 hover:text-zinc-900">Edit</Link></td>
            </tr>
          ))}
        </Table>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
        <span>{total} lead{total === 1 ? "" : "s"}</span>
        {pages > 1 && (
          <div className="flex items-center gap-3">
            {page > 1 && <Link href={qs(page - 1)} className="inline-flex h-9 items-center gap-1 hover:text-zinc-900"><ArrowLeft size={14} strokeWidth={2} aria-hidden /> Prev</Link>}
            <span>Page {page} of {pages}</span>
            {page < pages && <Link href={qs(page + 1)} className="inline-flex h-9 items-center gap-1 hover:text-zinc-900">Next <ArrowRight size={14} strokeWidth={2} aria-hidden /></Link>}
          </div>
        )}
      </div>
    </div>
  );
}
