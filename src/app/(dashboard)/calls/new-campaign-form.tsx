"use client";

import { useMemo, useState } from "react";
import { Input, Label, Select, Textarea } from "@/components/ui";
import { ActionForm } from "./action-form";
import { createCallCampaign } from "./actions";

type LeadOpt = { id: string; name: string | null; phone: string | null; status: string };
export type AgentOpt = { id: string; label: string };

export function AgentSelect({ agents }: { agents: AgentOpt[] }) {
  return (
    <div>
      <Label hint="its voice, prompt and phone number are used">Agent</Label>
      <Select name="agentId" required defaultValue={agents[0]?.id}>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function NewCampaignForm({ leads, agents }: { leads: LeadOpt[]; agents: AgentOpt[] }) {
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? leads.filter((l) => `${l.name ?? ""} ${l.phone ?? ""} ${l.status}`.toLowerCase().includes(s)) : leads;
  }, [q, leads]);
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <ActionForm action={createCallCampaign} submit="Create campaign" className="space-y-4">
      <div>
        <Label>Name</Label>
        <Input name="name" required placeholder="November demo outreach" />
      </div>
      <AgentSelect agents={agents} />
      <div>
        <Label hint="what the agent should achieve on each call">Objective</Label>
        <Textarea name="objective" required placeholder="Qualify the lead (budget, timeline, team size) and book a demo." />
      </div>
      <div>
        <Label>Audience</Label>
        <Select name="audience" value={audience} onChange={(e) => setAudience(e.target.value as "all" | "selected")}>
          <option value="all">All leads with a phone number ({leads.length})</option>
          <option value="selected">Selected leads</option>
        </Select>
      </div>
      {audience === "selected" && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or status…" />
            <span className="shrink-0 text-sm text-zinc-500">{picked.size} selected</span>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200">
            {shown.length === 0 && <p className="p-4 text-sm text-zinc-500">No matching leads.</p>}
            {shown.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 hover:bg-zinc-50">
                <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                <span className="min-w-0 truncate font-medium text-zinc-800">{l.name || "Unnamed"}</span>
                <span className="shrink-0 text-zinc-500">{l.phone}</span>
                <span className="ml-auto text-xs text-zinc-400">{l.status}</span>
              </label>
            ))}
          </div>
          {[...picked].map((id) => (
            <input key={id} type="hidden" name="leadIds" value={id} />
          ))}
        </div>
      )}
    </ActionForm>
  );
}
