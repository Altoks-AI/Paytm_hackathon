"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import type { FormState } from "./actions";

/** Form bound to a server action returning FormState; shows the error/success message inline. */
export function ActionForm({
  action,
  children,
  submit,
  variant = "primary",
  className,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  children?: ReactNode;
  submit: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? "Working…" : submit}
        </Button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
