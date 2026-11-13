"use client";

import { useActionState } from "react";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import { importLeads } from "../actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importLeads, undefined);
  return (
    <Card>
      <form action={action} className="space-y-4">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
          <p className="font-medium text-zinc-900">1. Download the template, fill it, upload it</p>
          <p className="mt-0.5 text-xs text-zinc-500">Columns: name, phone (required), email, notes, tags (comma separated).</p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <a href="/api/leads/template" className="font-medium text-brand-700 underline">Excel template (.xlsx)</a>
            <a href="/api/leads/template?format=csv" className="font-medium text-brand-700 underline">CSV template</a>
          </div>
        </div>
        <div>
          <Label hint="Excel .xlsx or .csv, max 5 MB">2. Upload the filled file</Label>
          <Input name="file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </div>
        <div>
          <Label hint="used only if no file is chosen; header row optional">Or paste CSV</Label>
          <Textarea name="csv" className="min-h-32 font-mono text-xs" placeholder={"name,phone,email,notes,tags\nPriya Sharma,9876543210,priya@example.com,Wants a demo,hot"} />
        </div>
        <p className="text-xs text-zinc-500">Rows are matched by phone number: existing leads are updated, new ones created. Rows without a valid phone are skipped.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending}>{pending ? "Importing…" : "Import leads"}</Button>
          {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
          {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        </div>
      </form>
    </Card>
  );
}
