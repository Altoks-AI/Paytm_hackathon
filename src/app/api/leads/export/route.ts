import { desc } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { getTenantId } from "@/lib/tenant";
import { toCsv } from "@/lib/leads";
import { leadWhere } from "@/app/(dashboard)/leads/query";

export async function GET(req: Request) {
  const tenantId = await getTenantId();
  if (!tenantId) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const rows = await db
    .select()
    .from(leads)
    .where(leadWhere(tenantId, sp.get("q") ?? "", sp.get("status") ?? "", sp.get("tag") ?? ""))
    .orderBy(desc(leads.createdAt));
  const csv = toCsv([
    ["name", "phone", "email", "status", "tags", "source", "notes", "created_at"],
    ...rows.map((l) => [l.name, l.phone, l.email, l.status, l.tags.join(";"), l.source, l.notes, l.createdAt.toISOString()]),
  ]);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
