import { Suspense } from "react";
import { requireTenant } from "@/lib/tenant";
import { metaConfig } from "../../_components/meta";
import { TemplateForm } from "./template-form";

export default function NewTemplatePage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <NewTemplate />
    </Suspense>
  );
}

async function NewTemplate() {
  const { tenantId } = await requireTenant();
  const cfg = await metaConfig(tenantId);
  return <TemplateForm connected={!!cfg} />;
}
