"use client";

import { useState } from "react";
import { Input, Label, Select } from "@/components/ui";
import { AUTO_VARIABLES, variableLabel } from "@/lib/agent/variables";

export type CallAgentOpt = { id: string; label: string; variables: string[] };

/** Agent picker + one input per {{variable}} used in the selected agent's instructions/greeting. */
export function CallNowFields({ agents }: { agents: CallAgentOpt[] }) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const vars = agents.find((a) => a.id === agentId)?.variables ?? [];
  return (
    <>
      <div>
        <Label hint="its voice, prompt and phone number are used">Agent</Label>
        <Select name="agentId" required value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </div>
      {vars.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-900">Variables</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {vars.map((v) => (
              <div key={`${agentId}-${v}`}>
                <Label hint={AUTO_VARIABLES.includes(v) ? `{{${v}}} · optional, auto from lead` : `{{${v}}}`}>{variableLabel(v)}</Label>
                <Input name={`var_${v}`} required={!AUTO_VARIABLES.includes(v)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
