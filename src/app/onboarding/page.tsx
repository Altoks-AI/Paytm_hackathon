import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { requireUser } from "@/lib/tenant";
import { Card } from "@/components/ui";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your company" };

async function Onboarding() {
  const user = await requireUser();
  if (user.tenantId) {
    const [t] = await db.select({ onboarded: tenants.onboarded }).from(tenants).where(eq(tenants.id, user.tenantId));
    if (t?.onboarded) redirect("/dashboard");
  }
  return <OnboardingForm email={user.email} />;
}

export default function OnboardingPage() {
  return (
    <div className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <p className="text-sm font-semibold tracking-tight">AgentDesk</p>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-900">Tell us about your company</h1>
        <p className="mt-1 text-sm text-zinc-500">We use this to brief your AI agent so it can answer your customers accurately.</p>
        <Card className="mt-6">
          <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
            <Onboarding />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
