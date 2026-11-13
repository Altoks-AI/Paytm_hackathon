"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { LEAD_STATUSES, csvToLeads, isUuid, normalizePhone, rowsToLeads, type ImportedLead } from "@/lib/leads";
import { xlsxToRows } from "@/lib/leads-excel";

export type FormState = { error?: string; ok?: string } | undefined;

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

export async function saveLead(_: FormState, fd: FormData): Promise<FormState> {
  const { tenantId } = await requireTenant();
  const id = String(fd.get("id") || "");
  const rawPhone = String(fd.get("phone") || "").trim();
  const phone = normalizePhone(rawPhone);
  if (rawPhone && !phone) return { error: "Invalid phone number" };
  const email = String(fd.get("email") || "").trim().toLowerCase() || null;
  if (!phone && !email) return { error: "Provide a phone number or an email" };
  const status = String(fd.get("status") || "new");
  const values = {
    name: String(fd.get("name") || "").trim() || null,
    phone,
    email,
    status: (LEAD_STATUSES as readonly string[]).includes(status) ? status : "new",
    tags: [...new Set(String(fd.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean))],
    notes: String(fd.get("notes") || "").trim() || null,
  };
  try {
    if (id) {
      if (!isUuid(id)) return { error: "Invalid lead" };
      const r = await db.update(leads).set(values).where(and(eq(leads.id, id), eq(leads.tenantId, tenantId))).returning({ id: leads.id });
      if (!r.length) return { error: "Lead not found" };
    } else {
      await db.insert(leads).values({ ...values, tenantId, source: "manual" });
    }
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "A lead with this phone number already exists" };
    throw e;
  }
  revalidatePath("/leads");
  redirect("/leads");
}

export async function deleteLead(id: string) {
  const { tenantId } = await requireTenant();
  if (!isUuid(id)) return { error: "Invalid lead" };
  await db.delete(leads).where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)));
  revalidatePath("/leads");
  redirect("/leads");
}

export async function importLeads(_: FormState, fd: FormData): Promise<FormState> {
  const { tenantId } = await requireTenant();
  const file = fd.get("file");
  let rows: ImportedLead[];
  if (file instanceof File && file.size > 0) {
    if (file.size > 5_000_000) return { error: "File too large (max 5 MB) — split it into smaller files" };
    if (/\.xlsx$/i.test(file.name) || file.type.includes("spreadsheetml")) {
      try {
        rows = rowsToLeads(await xlsxToRows(await file.arrayBuffer()));
      } catch {
        return { error: "Could not read that Excel file. Save it as .xlsx (or .csv) and try again." };
      }
    } else if (/\.xls$/i.test(file.name)) {
      return { error: "Old .xls files aren't supported. In Excel use Save As → .xlsx or .csv." };
    } else {
      rows = csvToLeads(await file.text());
    }
  } else {
    const text = String(fd.get("csv") || "");
    if (!text.trim()) return { error: "Paste CSV text or choose a file" };
    rows = csvToLeads(text);
  }
  if (!rows.length) return { error: "No rows found in the file" };
  const byPhone = new Map<string, { tenantId: string; name: string | null; phone: string; email: string | null; notes: string | null; tags: string[]; source: string }>();
  let invalid = 0;
  for (const r of rows) {
    const phone = normalizePhone(r.phone);
    if (!phone) { invalid++; continue; }
    byPhone.set(phone, { tenantId, phone, name: r.name || null, email: r.email.toLowerCase() || null, notes: r.notes || null, tags: r.tags, source: "import" });
  }
  const values = [...byPhone.values()];
  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(leads)
      .values(values.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [leads.tenantId, leads.phone],
        set: {
          name: sql`coalesce(excluded.name, ${leads.name})`,
          email: sql`coalesce(excluded.email, ${leads.email})`,
          notes: sql`coalesce(excluded.notes, ${leads.notes})`,
          tags: sql`case when jsonb_array_length(excluded.tags) > 0 then excluded.tags else ${leads.tags} end`,
        },
      });
  }
  revalidatePath("/leads");
  const dup = rows.length - invalid - values.length;
  return { ok: `Imported ${values.length} lead${values.length === 1 ? "" : "s"}` + (invalid ? `, skipped ${invalid} without a valid phone` : "") + (dup ? `, merged ${dup} duplicate rows` : "") + "." };
}
