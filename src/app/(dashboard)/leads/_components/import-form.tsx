"use client";

import { useActionState } from "react";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import { importLeads } from "../actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importLeads, undefined);
  return (
    <Card>
      <form action={action} className="space-y-4">
        <div>
          <Label hint="columns: name, phone, email (header row optional)">Paste CSV</Label>
          <Textarea name="csv" className="min-h-40 font-mono text-xs" placeholder={"name,phone,email\nPriya Sharma,9876543210,priya@example.com\n\"Kumar, Ravi\",+919812345678,"} />
        </div>
        <div>
          <Label hint="overrides pasted text, max 1 MB">Or upload a .csv file</Label>
          <Input name="file" type="file" accept=".csv,text/csv" />
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
