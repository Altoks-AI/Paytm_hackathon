import type { Channel } from "@/db/schema";

/**
 * The ONE agent used by every channel. Implemented in ./run.ts (`runAgent`).
 * It loads tenant context + settings, the conversation history, appends the user message,
 * runs the LLM tool loop, persists messages, and returns the reply.
 */
export type RunAgentInput = {
  tenantId: string;
  conversationId: string;
  channel: Channel;
  /** Customer's message (or transcribed speech). Omit to have the agent open the conversation (outbound call first line). */
  userMessage?: string;
  /** voice only */
  callDirection?: "inbound" | "outbound";
  /** outbound call objective (from a call campaign) */
  objective?: string;
};

export type RunAgentResult = {
  reply: string;
  /** true if the agent raised a handoff this turn (conversation.status is now "handoff"; a handoffs row was created) */
  handoff: boolean;
  /** true if the agent decided the conversation is finished (voice: hang up after speaking reply) */
  ended: boolean;
};
