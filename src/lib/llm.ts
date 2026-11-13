// LLM providers (both OpenAI-compatible). Model ids "sarvam/<id>" go to Sarvam (SARVAM_API_KEY); everything else to OpenRouter (OPENROUTER_API_KEY).
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

export const SARVAM_MODEL = "sarvam/sarvam-105b-conversations";
export const DEFAULT_MODEL = process.env.LLM_DEFAULT_MODEL || SARVAM_MODEL;

/** Endpoint, headers and provider-specific body for a model id. */
function provider(model: string): { name: string; url: string; headers: Record<string, string>; model: string; extra: Record<string, unknown> } {
  if (model.startsWith("sarvam/")) {
    return {
      name: "Sarvam",
      url: "https://api.sarvam.ai/v1/chat/completions",
      headers: { "api-subscription-key": process.env.SARVAM_API_KEY || "", "Content-Type": "application/json" },
      model: model.slice("sarvam/".length),
      // Reasoning is on by default and eats max_tokens / adds latency; agents need fast replies.
      extra: { reasoning_effort: null } as Record<string, unknown>,
    };
  }
  return {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    model,
    extra: {} as Record<string, unknown>,
  };
}

export async function chat(opts: { messages: ChatMessage[]; tools?: ToolDef[]; model?: string; maxTokens?: number; temperature?: number }) {
  const p = provider(opts.model || DEFAULT_MODEL);
  const res = await fetch(p.url, {
    method: "POST",
    headers: p.headers,
    body: JSON.stringify({
      ...p.extra,
      model: p.model,
      messages: opts.messages,
      tools: opts.tools?.length ? opts.tools : undefined,
      max_tokens: opts.maxTokens ?? 600,
      temperature: opts.temperature ?? 0.4,
    }),
  });
  if (!res.ok) throw new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error(`${p.name} returned no message`);
  return msg as AssistantMessage;
}

/** One-shot text completion helper. */
export async function complete(system: string, user: string, opts: { model?: string; maxTokens?: number } = {}) {
  const msg = await chat({ messages: [{ role: "system", content: system }, { role: "user", content: user }], ...opts });
  return (msg.content || "").trim();
}

export type AssistantMessage = { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };

/**
 * Streaming chat (OpenRouter SSE). Yields text deltas as they arrive; the generator's return value is the
 * complete assistant message (content + accumulated tool calls). Abort with `signal`.
 */
export async function* chatStream(opts: { messages: ChatMessage[]; tools?: ToolDef[]; model?: string; maxTokens?: number; temperature?: number; signal?: AbortSignal }): AsyncGenerator<string, AssistantMessage> {
  const p = provider(opts.model || DEFAULT_MODEL);
  const res = await fetch(p.url, {
    method: "POST",
    signal: opts.signal,
    headers: p.headers,
    body: JSON.stringify({
      ...p.extra,
      model: p.model,
      messages: opts.messages,
      tools: opts.tools?.length ? opts.tools : undefined,
      max_tokens: opts.maxTokens ?? 600,
      temperature: opts.temperature ?? 0.4,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 300)}`);

  let content = "";
  const calls: ToolCall[] = [];
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  const result = (): AssistantMessage => {
    const tc = calls.filter(Boolean);
    return { role: "assistant", content: content || null, tool_calls: tc.length ? tc : undefined };
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue; // SSE comments (": OPENROUTER PROCESSING") / blank lines
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return result();
        let chunk: { error?: { message?: string }; choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        if (chunk.error) throw new Error(`${p.name} stream error: ${chunk.error.message ?? "unknown"}`);
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        for (const tc of delta.tool_calls ?? []) {
          const i = tc.index ?? calls.length;
          const cur = (calls[i] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.function.name += tc.function.name;
          if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
        }
        if (delta.content) {
          content += delta.content;
          yield delta.content;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return result();
}
