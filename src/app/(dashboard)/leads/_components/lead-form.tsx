"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { LEAD_STATUSES } from "@/lib/leads";
import { saveLead } from "../actions";

type Lead = { id: string; name: string | null; phone: string | null; email: string | null; status: string; tags: string[]; notes: string | null };

export function LeadForm({ lead }: { lead?: Lead }) {
  const [state, action, pending] = useActionState(saveLead, undefined);
  return (
    <Card>
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        {lead && <input type="hidden" name="id" value={lead.id} />}
        <div>
          <Label>Name</Label>
          <Input name="name" defaultValue={lead?.name ?? ""} placeholder="Priya Sharma" />
        </div>
        <div>
          <Label hint="+91 added to 10-digit numbers">Phone</Label>
          <Input name="phone" defaultValue={lead?.phone ?? ""} placeholder="9876543210" />
        </div>
        <div>
          <Label>Email</Label>
          <Input name="email" type="email" defaultValue={lead?.email ?? ""} placeholder="priya@example.com" />
        </div>
        <div>
          <Label>Status</Label>
          <Select name="status" defaultValue={lead?.status ?? "new"}>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label hint="comma separated">Tags</Label>
          <Input name="tags" defaultValue={lead?.tags.join(", ") ?? ""} placeholder="vip, mumbai" />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <Textarea name="notes" defaultValue={lead?.notes ?? ""} />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button disabled={pending}>{pending ? "Saving…" : lead ? "Save changes" : "Add lead"}</Button>
          <Link href="/leads" className="text-sm text-zinc-500 hover:text-zinc-800">Cancel</Link>
          {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        </div>
      </form>
    </Card>
  );
}
