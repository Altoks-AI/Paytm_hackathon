import { chatStream, type AssistantMessage } from "@/lib/llm";
import type { RunAgentInput, RunAgentResult } from "./types";
import { executeTool } from "./tools";
import { buildRun, emptyReplyFallback, FALLBACK, MAX_TOOL_ROUNDS, persistReply, startRun } from "./run";

const MIN_CHUNK = 12;
const MAX_CHUNK = 220;

/** Splits streamed text into speakable sentence-sized chunks. */
class SentenceSplitter {
  private buf = "";
  constructor(private emit: (s: string) => void) {}
  push(delta: string) {
    this.buf += delta;
    for (;;) {
      let cut = -1;
      const re = /[.!?।…]+["')\]]*\s+|\n+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(this.buf))) {
        const end = m.index + m[0].length;
        if (this.buf.slice(0, end).trim().length >= MIN_CHUNK) {
          cut = end;
          break;
        }
      }
      if (cut < 0 && this.buf.length > MAX_CHUNK) {
        const soft = Math.max(this.buf.lastIndexOf(", ", MAX_CHUNK), this.buf.lastIndexOf(" ", MAX_CHUNK));
        cut = soft > MIN_CHUNK ? soft + 1 : MAX_CHUNK;
      }
      if (cut < 0) return;
      this.out(this.buf.slice(0, cut));
      this.buf = this.buf.slice(cut);
    }
  }
  flush() {
    this.out(this.buf);
    this.buf = "";
  }
  private out(s: string) {
    const t = s.replace(/[*_#`]+/g, "").replace(/\s+/g, " ").trim();
    if (t) this.emit(t);
  }
}

/**
 * Streaming variant of runAgent (same prompt, tools, persistence and result) for realtime voice.
 * `onText` receives speakable sentence chunks as soon as they are generated. If `signal` aborts (barge-in),
 * generation stops and only the text produced so far is persisted.
 */
export async function runAgentStream(input: RunAgentInput, opts: { onText: (sentence: string) => void; signal?: AbortSignal }): Promise<RunAgentResult> {
  const prep = await startRun(input);
  if ("result" in prep) {
    if (prep.result.reply) opts.onText(prep.result.reply);
    return prep.result;
  }
  const { ctx } = prep;
  const spoken: string[] = [];
  const splitter = new SentenceSplitter((s) => {
    if (opts.signal?.aborted) return;
    spoken.push(s);
    opts.onText(s);
  });
  const aborted = () => !!opts.signal?.aborted;
  try {
    const { settings, msgs, defs, maxTokens } = await buildRun(input, prep);
    for (let round = 0; round <= MAX_TOOL_ROUNDS && !aborted(); round++) {
      const gen = chatStream({ messages: msgs, tools: round < MAX_TOOL_ROUNDS ? defs : undefined, model: settings?.model, temperature: settings?.temperature, maxTokens, signal: opts.signal });
      let res: AssistantMessage;
      for (;;) {
        const step = await gen.next();
        if (step.done) {
          res = step.value;
          break;
        }
        splitter.push(step.value);
      }
      splitter.flush();
      if (res.tool_calls?.length && round < MAX_TOOL_ROUNDS) {
        msgs.push({ role: "assistant", content: res.content ?? null, tool_calls: res.tool_calls });
        for (const tc of res.tool_calls) {
          msgs.push({ role: "tool", tool_call_id: tc.id, content: await executeTool(tc.function.name, tc.function.arguments, ctx) });
        }
        continue;
      }
      break;
    }
  } catch (e) {
    if (!aborted()) {
      console.error("runAgentStream failed", e);
      if (!spoken.length) splitter.push(FALLBACK + " ");
      splitter.flush();
    }
  }
  if (!spoken.length && !aborted()) {
    splitter.push(emptyReplyFallback(ctx) + " ");
    splitter.flush();
  }
  const reply = spoken.join(" ");
  await persistReply(input, reply, prep.touch);
  return { reply, handoff: ctx.handoff, ended: ctx.ended };
}
