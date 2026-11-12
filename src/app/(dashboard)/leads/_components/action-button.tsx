"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui";

export type ActionResult = { error?: string; ok?: string } | void;

/** Button that invokes a (bound) server action and shows its error/ok message inline. */
export function ActionButton({ action, children, confirm, variant = "secondary", pendingLabel }: { action: () => Promise<ActionResult>; children: ReactNode; confirm?: string; variant?: "primary" | "secondary" | "danger" | "ghost"; pendingLabel?: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult>();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setRes(undefined);
          start(async () => setRes(await action()));
        }}
      >
        {pending ? pendingLabel ?? "Working…" : children}
      </Button>
      {res?.error && <span className="max-w-md text-xs text-red-600">{res.error}</span>}
      {res?.ok && <span className="max-w-md text-xs text-emerald-700">{res.ok}</span>}
    </span>
  );
}
