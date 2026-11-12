import type { Metadata } from "next";
import { requireTenant } from "@/lib/tenant";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { tenant } = await requireTenant();
  const { name, industry, size, location, contactEmail, contactPhone, website } = tenant;
  return (
    <>
      <PageHeader title="Company settings" description="Your company profile and the context your AI agent is briefed with." />
      <SettingsForm company={{ name, industry, size, location, contactEmail, contactPhone, website }} summary={tenant.companySummary ?? ""} />
    </>
  );
}
