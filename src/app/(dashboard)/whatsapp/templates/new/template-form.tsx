"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { LANGUAGES, countVariables, defaultSample, renderBody, toTemplateName } from "@/lib/wa-templates";
import { createTemplate } from "../actions";

type Var = { kind: string; label: string; sample: string };
const blank: Var = { kind: "lead.name", label: "", sample: "" };

export function TemplateForm({ connected }: { connected: boolean }) {
  const [state, action, pending] = useActionState(createTemplate, undefined);
  const [name, setName] = useState("");
  const [body, setBody] = useState("Hi {{1}}, thanks for your interest! ");
  const [vars, setVars] = useState<Var[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { count, error: varError } = countVariables(body);
  const list = Array.from({ length: count }, (_, i) => vars[i] ?? blank);
  const mapping = (v: Var) => (v.kind === "custom" ? `custom:${v.label.trim()}` : v.kind);
  const samples = list.map((v) => v.sample.trim() || defaultSample(mapping(v)));

  const setVar = (i: number, patch: Partial<Var>) => setVars(() => { const next = [...list]; next[i] = { ...next[i], ...patch }; return next; });
  const insertVar = () => {
    const tag = `{{${count + 1}}}`;
    const el = ref.current;
    const at = el ? el.selectionStart : body.length;
    setBody(body.slice(0, at) + tag + body.slice(at));
  };

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="min-w-0 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label hint="lowercase letters, numbers, underscores">Template name</Label>
            <Input name="name" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+/, ""))} onBlur={() => setName(toTemplateName(name))} placeholder="diwali_offer" required />
          </div>
          <div>
            <Label>Language</Label>
            <Select name="language" defaultValue="en">{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select name="category" defaultValue="MARKETING">
              <option value="MARKETING">MARKETING</option>
              <option value="UTILITY">UTILITY</option>
            </Select>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <Label className="mb-0">Body</Label>
            <Button type="button" variant="ghost" className="h-8 text-xs" onClick={insertVar}><Plus size={14} strokeWidth={2} aria-hidden /> Insert variable {`{{${count + 1}}}`}</Button>
          </div>
          <Textarea ref={ref} name="body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-32" maxLength={1024} required />
          <p className="mt-1 text-xs text-zinc-400">{body.length}/1024 · Meta doesn&apos;t allow a variable at the very start or end of the body.</p>
          {varError && <p className="mt-1 text-xs text-red-600">{varError}</p>}
        </div>
        {list.length > 0 && (
          <div className="space-y-3">
            <Label className="mb-0">Variables</Label>
            {list.map((v, i) => (
              <div key={i} className="grid items-center gap-2 sm:grid-cols-[48px_1fr_1fr_1fr]">
                <span className="font-mono text-sm text-zinc-500">{`{{${i + 1}}}`}</span>
                <Select value={v.kind} onChange={(e) => setVar(i, { kind: e.target.value })}>
                  <option value="lead.name">Lead name</option>
                  <option value="lead.phone">Lead phone</option>
                  <option value="lead.email">Lead email</option>
                  <option value="custom">Custom value…</option>
                </Select>
                {v.kind === "custom" ? <Input value={v.label} onChange={(e) => setVar(i, { label: e.target.value })} placeholder="Label, e.g. offer" /> : <span />}
                <Input value={v.sample} onChange={(e) => setVar(i, { sample: e.target.value })} placeholder={`Sample: ${defaultSample(mapping(v))}`} />
              </div>
            ))}
            <p className="text-xs text-zinc-400">Samples are sent to Meta for review. Custom values are filled in per campaign.</p>
          </div>
        )}
        <input type="hidden" name="variables" value={JSON.stringify(list.map(mapping))} />
        <input type="hidden" name="samples" value={JSON.stringify(samples)} />
        {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button name="intent" value="submit" disabled={pending || !connected || !!varError}>{pending ? "Saving…" : "Save & submit to Meta"}</Button>
          <Button name="intent" value="draft" variant="secondary" disabled={pending || !!varError}>Save draft</Button>
          <Link href="/whatsapp/templates" className="text-sm text-zinc-500 hover:text-zinc-800">Cancel</Link>
          {!connected && <span className="text-xs text-amber-700">Connect WhatsApp to submit to Meta.</span>}
        </div>
      </Card>
      <div>
        <Label>Preview</Label>
        <div className="rounded-[10px] bg-[#e5ddd5] p-4">
          <div className="max-w-[280px] rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-zinc-800">
            <p className="whitespace-pre-wrap break-words">{renderBody(body, samples) || <span className="text-zinc-400">Your message…</span>}</p>
            <p className="mt-1 text-right text-[10px] text-zinc-400">12:00</p>
          </div>
        </div>
      </div>
    </form>
  );
}
