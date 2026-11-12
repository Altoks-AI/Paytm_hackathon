"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { normalizeWebsite, summarizeCompany } from "@/lib/company";
import { readCompanyForm } from "../../onboarding/company-fields";

export type SettingsState = { ok?: string; error?: string; summary?: string; at?: number };

export async function saveSettings(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const { tenantId } = await requireTenant();
  const c = readCompanyForm(formData);
  let summary = String(formData.get("companySummary") ?? "").trim();
  if (!c.name) return { error: "Company name is required", summary, at: Date.now() };
  if (c.website && !normalizeWebsite(c.website)) return { error: "Enter a valid website URL", summary, at: Date.now() };
  c.website = normalizeWebsite(c.website);

  const regenerate = formData.get("intent") === "regenerate";
  if (regenerate) {
    try {
      summary = await summarizeCompany(c);
    } catch (e) {
      console.error("summarizeCompany failed", e);
      return { error: "Could not generate a summary right now. Your edits were not saved; try again.", summary, at: Date.now() };
    }
  }

  await db.update(tenants).set({ ...c, companySummary: summary || null }).where(eq(tenants.id, tenantId));
  revalidatePath("/", "layout");
  return { ok: regenerate ? "Summary regenerated from your website and saved." : "Settings saved.", summary, at: Date.now() };
}
