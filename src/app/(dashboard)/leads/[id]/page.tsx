import { Suspense } from "react";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { isUuid } from "@/lib/leads";
import { PageHeader } from "@/components/ui";
import { LeadForm } from "../_components/lead-form";
import { ActionButton } from "../_components/action-button";
import { deleteLead } from "../actions";

export default function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="max-w-2xl">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <EditLead params={params} />
      </Suspense>
    </div>
  );
}

async function EditLead({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId } = await requireTenant();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)));
  if (!lead) notFound();
  return (
    <>
      <PageHeader
        title={lead.name || lead.phone || "Lead"}
        description={`Source: ${lead.source} · Added ${lead.createdAt.toLocaleDateString()}`}
        action={<ActionButton action={deleteLead.bind(null, lead.id)} variant="danger" confirm="Delete this lead?" pendingLabel="Deleting…">Delete</ActionButton>}
      />
      <LeadForm lead={lead} />
    </>
  );
}
