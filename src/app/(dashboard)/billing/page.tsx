import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditTransactions } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { CREDIT_COSTS, type CreditKind } from "@/lib/credits";
import { Badge, Button, Card, Empty, PageHeader, Table } from "@/components/ui";

// Payments are not wired up yet (MVP): packs are display-only.
const PACKS = [
  { credits: 1000, price: "₹499" },
  { credits: 5000, price: "₹1,999" },
  { credits: 20000, price: "₹6,999" },
];

const kindLabel = (k: string) => (k in CREDIT_COSTS ? CREDIT_COSTS[k as CreditKind].label : k === "grant" ? "Free credits" : k === "refund" ? "Refund" : k === "topup" ? "Top-up" : k);

export default async function BillingPage() {
  const { tenant, tenantId } = await requireTenant();
  const tx = await db.select().from(creditTransactions).where(eq(creditTransactions.tenantId, tenantId)).orderBy(desc(creditTransactions.createdAt)).limit(100);

  return (
    <>
      <PageHeader title="Billing & Credits" description="Everything the platform does for you is paid for with credits." />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <p className="text-sm text-zinc-500">Credit balance</p>
          <p className={`mt-1 text-4xl font-semibold tracking-tight ${tenant.credits <= 0 ? "text-red-600" : "text-zinc-900"}`}>{tenant.credits.toLocaleString("en-IN")}</p>
          {tenant.credits <= 50 && <p className="mt-2 text-sm text-red-600">Low balance — the agent and campaigns stop when credits run out.</p>}
        </Card>
        <Card className="md:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-sm font-medium text-zinc-900">Buy credits</p>
            <Badge tone="amber">Payments coming soon</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {PACKS.map((p) => (
              <div key={p.credits} className="rounded-lg border border-zinc-200 p-3">
                <p className="text-lg font-semibold text-zinc-900">{p.credits.toLocaleString("en-IN")}</p>
                <p className="text-sm text-zinc-500">credits · {p.price}</p>
                <Button variant="secondary" className="mt-3 w-full" disabled>
                  Buy
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-900">Pricing</h2>
      <Table head={["Action", "Credits", "Charged"]}>
        {Object.entries(CREDIT_COSTS).map(([k, v]) => (
          <tr key={k}>
            <td className="text-zinc-900">{v.label}</td>
            <td className="font-medium text-zinc-900">{v.cost}</td>
            <td className="text-zinc-500">{v.unit}</td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-900">Recent activity</h2>
      {tx.length ? (
        <Table head={["When", "What", "Note", "Credits"]}>
          {tx.map((t) => (
            <tr key={t.id}>
              <td className="whitespace-nowrap text-zinc-500">{t.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="text-zinc-900">{kindLabel(t.kind)}</td>
              <td className="text-zinc-500">{t.note}</td>
              <td className={`font-medium ${t.amount > 0 ? "text-emerald-600" : "text-zinc-900"}`}>{t.amount > 0 ? `+${t.amount}` : t.amount}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>No credit activity yet.</Empty>
      )}
    </>
  );
}
