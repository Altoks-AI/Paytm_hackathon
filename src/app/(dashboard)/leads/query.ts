import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { leads } from "@/db/schema";

/** Tenant-scoped lead filter shared by the leads page and the CSV export route. */
export function leadWhere(tenantId: string, q?: string, status?: string, tag?: string): SQL {
  const conds: (SQL | undefined)[] = [eq(leads.tenantId, tenantId)];
  if (q?.trim()) {
    const p = `%${q.trim().replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    conds.push(or(ilike(leads.name, p), ilike(leads.phone, p), ilike(leads.email, p)));
  }
  if (status) conds.push(eq(leads.status, status));
  if (tag) conds.push(sql`${leads.tags} @> ${JSON.stringify([tag])}::jsonb`);
  return and(...conds)!;
}
