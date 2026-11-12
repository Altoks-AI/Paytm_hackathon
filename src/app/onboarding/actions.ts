"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { creditTransactions, tenants, users } from "@/db/schema";
import { FREE_CREDITS } from "@/lib/credits";
import { requireUser } from "@/lib/tenant";
import { basicSummary, normalizeWebsite, summarizeCompany } from "@/lib/company";
import { readCompanyForm } from "./company-fields";

export async function completeOnboarding(_: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser();
  if (user.tenantId) {
    const [t] = await db.select({ onboarded: tenants.onboarded }).from(tenants).where(eq(tenants.id, user.tenantId));
    if (t?.onboarded) redirect("/dashboard");
  }
  const c = readCompanyForm(formData);
  if (!c.name) return { error: "Company name is required" };
  if (c.website && !normalizeWebsite(c.website)) return { error: "Enter a valid website URL" };
  c.website = normalizeWebsite(c.website);

  let companySummary: string;
  try {
    companySummary = await summarizeCompany(c);
  } catch (e) {
    console.error("summarizeCompany failed", e);
    companySummary = basicSummary(c);
  }

  await db.transaction(async (tx) => {
    let tenantId = user.tenantId;
    if (tenantId) {
      await tx.update(tenants).set({ ...c, companySummary, onboarded: true }).where(eq(tenants.id, tenantId));
    } else {
      const [t] = await tx.insert(tenants).values({ ...c, companySummary, onboarded: true, credits: FREE_CREDITS }).returning({ id: tenants.id });
      tenantId = t.id;
      await tx.insert(creditTransactions).values({ tenantId, amount: FREE_CREDITS, kind: "grant", note: "Free starting credits" });
      await tx.update(users).set({ tenantId }).where(eq(users.id, user.id));
    }
  });
  redirect("/dashboard");
}
