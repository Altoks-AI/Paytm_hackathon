import { PageHeader } from "@/components/ui";
import { LeadForm } from "../_components/lead-form";

export default function NewLeadPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Add lead" />
      <LeadForm />
    </div>
  );
}
