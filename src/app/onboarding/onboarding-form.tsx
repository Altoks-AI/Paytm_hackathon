"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui";
import { CompanyFields } from "./company-fields";
import { completeOnboarding } from "./actions";

export function OnboardingForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(completeOnboarding, {});
  const [, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault(); // manual submit so fields aren't reset if validation fails
        const fd = new FormData(e.currentTarget);
        start(() => action(fd));
      }}
      className="space-y-5"
    >
      <CompanyFields v={{ contactEmail: email }} />
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-xs text-zinc-500">{pending ? "Reading your website and preparing your agent — this can take up to ~20 seconds…" : "You can change all of this later in Settings."}</p>
        <Button type="submit" disabled={pending}>{pending ? "Setting up…" : "Finish setup"}</Button>
      </div>
    </form>
  );
}
