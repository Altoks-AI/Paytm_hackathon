import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ImportForm } from "../_components/import-form";

export default function ImportLeadsPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Import leads" description="Bulk add or update leads from a CSV." action={<Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"><ArrowLeft size={14} strokeWidth={2} aria-hidden /> Back to leads</Link>} />
      <ImportForm />
    </div>
  );
}
