// Realtime voice (Twilio Media Streams) helpers shared by the TwiML routes and the custom-server stream handler.
// Framework-free: loaded both by Next routes and by server.ts (tsx).
import { createHmac, timingSafeEqual } from "crypto";
import { appUrl } from "@/lib/tenant-data";

/** Streaming is used when running under server.ts (which sets VOICE_REALTIME=1) unless VOICE_MODE=turn. */
export const realtimeEnabled = () => process.env.VOICE_REALTIME === "1" && process.env.VOICE_MODE !== "turn";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export const signStreamToken = (callId: string, callSid: string) => createHmac("sha256", secret()).update(`voice-stream:${callId}:${callSid}`).digest("base64url");

export function verifyStreamToken(callId: string, callSid: string, token: string) {
  const a = Buffer.from(signStreamToken(callId, callSid));
  const b = Buffer.from(token || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** TwiML that connects the call to our bidirectional media stream. */
export function streamTwiml(callId: string, callSid: string) {
  const url = `${appUrl().replace(/^http/, "ws")}/voice-stream`;
  const params = { callId, token: signStreamToken(callId, callSid) };
  const p = Object.entries(params).map(([k, v]) => `<Parameter name="${k}" value="${esc(v)}"/>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${esc(url)}">${p}</Stream></Connect></Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}
