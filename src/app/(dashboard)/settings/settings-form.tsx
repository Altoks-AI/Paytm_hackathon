"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Button, Card, Label, Textarea } from "@/components/ui";
import { CompanyFields, type CompanyValues } from "../../onboarding/company-fields";
import { saveSettings } from "./actions";

export function SettingsForm({ company, summary }: { company: CompanyValues; summary: string }) {
  const [state, action, pending] = useActionState(saveSettings, {});
  const [, start] = useTransition();
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  // Show the regenerated summary in the (uncontrolled) textarea.
  useEffect(() => {
    if (state.ok && state.summary !== undefined && summaryRef.current) summaryRef.current.value = state.summary;
  }, [state]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault(); // manual submit so edits aren't reset on error
        const fd = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) fd.set(submitter.name, submitter.value);
        start(() => action(fd));
      }}
      className="space-y-4"
    >
      <Card>
        <h2 className="mb-4 font-medium text-zinc-900">Company details</h2>
        <CompanyFields v={company} />
      </Card>
      <Card>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 className="font-medium text-zinc-900">Company summary</h2>
            <p className="mt-0.5 text-sm text-zinc-500">Background context your AI agent uses on every channel. Edit freely, or regenerate it from your website.</p>
          </div>
          <Button type="submit" name="intent" value="regenerate" variant="secondary" disabled={pending}>
            {pending ? "Working…" : "Regenerate from website"}
          </Button>
        </div>
        <Label className="sr-only">Company summary</Label>
        <Textarea ref={summaryRef} name="companySummary" defaultValue={summary} rows={10} className="min-h-48" />
      </Card>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && !pending && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <div className="flex justify-end">
        <Button type="submit" name="intent" value="save" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
