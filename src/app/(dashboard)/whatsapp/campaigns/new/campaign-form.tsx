"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { LEAD_STATUSES } from "@/lib/leads";
import { customLabel, customLabels, renderBody } from "@/lib/wa-templates";
import { createCampaign } from "../actions";

type T = { id: string; name: string; language: string; body: string; variables: string[] };
type L = { id: string; name: string | null; phone: string | null; status: string; tags: string[] };

export function CampaignForm({ templates, leads, senders }: { templates: T[]; leads: L[]; senders: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createCampaign, undefined);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");

  const t = templates.find((x) => x.id === templateId);
  const labels = t ? customLabels(t.variables) : [];
  const allTags = useMemo(() => [...new Set(leads.flatMap((l) => l.tags))].sort(), [leads]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return leads.filter((l) => (!s || (l.name ?? "").toLowerCase().includes(s) || (l.phone ?? "").includes(s)) && (!status || l.status === status) && (!tag || l.tags.includes(tag)));
  }, [leads, q, status, tag]);
  const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.has(l.id));

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleVisible = () => setSelected((prev) => { const n = new Set(prev); visible.forEach((l) => (allVisibleSelected ? n.delete(l.id) : n.add(l.id))); return n; });

  const preview = t ? renderBody(t.body, t.variables.map((v) => (v === "lead.name" ? "Rahul" : v === "lead.phone" ? "+919876543210" : v === "lead.email" ? "rahul@example.com" : custom[customLabel(v) ?? ""] || `[${customLabel(v)}]`))) : "";

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <Card className="space-y-4">
          <div>
            <Label>Campaign name</Label>
            <Input name="name" placeholder="Diwali offer – Nov" required />
          </div>
          <div>
            <Label hint="the agent's WhatsApp number">Send from</Label>
            <Select name="agentId" defaultValue={senders[0]?.id ?? ""}>
              {senders.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              {!senders.length && <option value="">Default number</option>}
            </Select>
          </div>
          <div>
            <Label hint="approved only">Template</Label>
            <Select name="templateId" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.language})</option>)}
            </Select>
          </div>
          {labels.map((label) => (
            <div key={label}>
              <Label hint="same for every recipient">{label}</Label>
              <Input name={`custom:${label}`} value={custom[label] ?? ""} onChange={(e) => setCustom({ ...custom, [label]: e.target.value })} required />
            </div>
          ))}
        </Card>

        <Card className="space-y-4">
          <Label className="mb-0">Audience</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="audience" value="all" checked={audience === "all"} onChange={() => setAudience("all")} /> All leads with a phone ({leads.length}{leads.length >= 5000 ? "+" : ""})</label>
            <label className="flex items-center gap-2"><input type="radio" name="audience" value="selected" checked={audience === "selected"} onChange={() => setAudience("selected")} /> Selected leads</label>
          </div>
          {audience === "selected" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="max-w-xs" />
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
                  <option value="">All statuses</option>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-36">
                  <option value="">All tags</option>
                  {allTags.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-zinc-200">
                <label className="sticky top-0 flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} /> Select all shown ({visible.length}) · {selected.size} selected
                </label>
                {visible.slice(0, 500).map((l) => (
                  <label key={l.id} className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 hover:bg-zinc-50">
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                    <span className="min-w-0 flex-1 truncate">{l.name || <span className="text-zinc-400">No name</span>}</span>
                    <span className="shrink-0 font-mono text-xs text-zinc-500">{l.phone}</span>
                    <Badge>{l.status}</Badge>
                  </label>
                ))}
                {visible.length > 500 && <p className="px-3 py-2 text-xs text-zinc-400">Showing 500 of {visible.length} — refine the search, or use “Select all shown”.</p>}
                {visible.length === 0 && <p className="px-3 py-4 text-center text-xs text-zinc-400">No leads match.</p>}
              </div>
              {[...selected].map((id) => <input key={id} type="hidden" name="leadIds" value={id} />)}
            </div>
          )}
        </Card>

        {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending || (audience === "selected" && selected.size === 0)}>{pending ? "Creating…" : "Create campaign"}</Button>
          <Link href="/whatsapp/campaigns" className="text-sm text-zinc-500 hover:text-zinc-800">Cancel</Link>
          <span className="text-xs text-zinc-400">You&apos;ll review and send on the next screen.</span>
        </div>
      </div>
      <div>
        <Label>Preview</Label>
        <div className="rounded-[10px] bg-[#e5ddd5] p-4">
          <div className="max-w-[280px] rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-zinc-800">
            <p className="whitespace-pre-wrap break-words">{preview}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-400">Missing lead names are sent as “there”.</p>
      </div>
    </form>
  );
}
