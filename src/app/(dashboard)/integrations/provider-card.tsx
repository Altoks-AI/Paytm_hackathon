"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { Badge, Button, Card, Input, Label, Toggle } from "@/components/ui";
import type { ProviderDef } from "./providers";
import { disconnectProvider, saveProvider, setProviderEnabled } from "./actions";

type Props = {
  def: ProviderDef;
  connected: boolean;
  enabled: boolean;
  values: Record<string, string>; // non-secret saved values
  savedSecrets: string[]; // keys of secret fields that have a stored value
  children?: ReactNode; // webhook info
};

export function ProviderCard({ def, connected, enabled, values, savedSecrets, children }: Props) {
  const [state, action, saving] = useActionState(saveProvider.bind(null, def.id), {});
  const [busy, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const docId = def.id === "meta_whatsapp" ? "whatsapp" : def.id;

  // Clear typed secrets after a successful save (masked placeholders take over).
  useEffect(() => {
    if (state.ok) form.current?.querySelectorAll<HTMLInputElement>("input[data-secret]").forEach((i) => (i.value = ""));
  }, [state]);

  return (
    <Card id={def.id} className="scroll-mt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <ChevronDown size={18} aria-hidden className={`mt-0.5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : "-rotate-90"}`} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-zinc-900">{def.name}</span>
              <Badge tone={connected ? (enabled ? "green" : "amber") : "zinc"}>{connected ? (enabled ? "Connected" : "Disabled") : "Not connected"}</Badge>
            </span>
            <span className="mt-0.5 block text-sm text-zinc-500">{def.description}</span>
          </span>
        </button>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <a href={`/documentation#${docId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline">
            <BookOpen size={14} aria-hidden /> Learn how
          </a>
          {connected && (
            <>
              {enabled ? "Enabled" : "Disabled"}
              <Toggle checked={enabled} disabled={busy} onChange={() => start(() => setProviderEnabled(def.id, !enabled))} aria-label={`Enable ${def.name}`} />
            </>
          )}
        </div>
      </div>

      <div hidden={!open} className="mt-4">
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault(); // manual submit: keeps typed values if validation fails
          const fd = new FormData(e.currentTarget);
          start(() => action(fd));
        }}
        className="space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {def.fields.map((f) => {
            const saved = f.secret && savedSecrets.includes(f.key);
            return (
              <div key={f.key}>
                <Label hint={f.optional ? "optional" : undefined}>{f.label}</Label>
                <Input
                  name={f.key}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  data-secret={f.secret ? "" : undefined}
                  defaultValue={f.secret ? undefined : values[f.key] ?? ""}
                  placeholder={saved ? "Saved (leave blank to keep)" : ""}
                />
                <p className="mt-1 text-xs text-zinc-400">{f.hint}</p>
              </div>
            );
          })}
        </div>
        {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        {state.ok && !saving && <p className="text-sm text-emerald-700">Saved.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : connected ? "Update" : "Connect"}</Button>
          {connected && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              className="text-red-600 hover:bg-red-50"
              onClick={() => {
                if (confirm(`Disconnect ${def.name}? Stored credentials will be deleted.`)) start(() => disconnectProvider(def.id));
              }}
            >
              Disconnect
            </Button>
          )}
        </div>
      </form>

      {children && <div className="mt-5 space-y-3 border-t border-zinc-100 pt-4">{children}</div>}
      </div>
    </Card>
  );
}
