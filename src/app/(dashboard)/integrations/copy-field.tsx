"use client";

import { useState } from "react";

export function CopyField({ label, value, note }: { label: string; value: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-600">
        {label}
        {note && <span className="ml-2 font-normal text-zinc-400">{note}</span>}
      </p>
      <div className="flex min-w-0 gap-2">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="h-9 w-full min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-xs text-zinc-700 outline-none" />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
          className="h-9 shrink-0 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
