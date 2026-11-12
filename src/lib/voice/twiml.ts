import twilio from "twilio";
import type { NextRequest } from "next/server";
import { appUrl } from "@/lib/tenant-data";
import { textToSpeech } from "@/lib/sarvam";
import { putAudio } from "./audio-cache";

export type VoiceCtx = { language: string; voice: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function twimlResponse(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { "Content-Type": "text/xml" } });
}

export const hangup = (msg?: string) => twimlResponse(`${msg ? `<Say>${esc(msg)}</Say>` : ""}<Hangup/>`);

/** Parse Twilio's form POST and validate X-Twilio-Signature against the tenant's auth token. */
export async function readTwilioForm(req: NextRequest): Promise<Record<string, string>> {
  const fd = await req.formData();
  const params: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") params[k] = v;
  });
  return params;
}

export function isValidTwilio(req: NextRequest, authToken: string, params: Record<string, string>) {
  const signature = req.headers.get("x-twilio-signature") || "";
  const url = appUrl() + req.nextUrl.pathname + req.nextUrl.search;
  return !!signature && twilio.validateRequest(authToken, signature, url, params);
}

export const forbidden = () => new Response("Invalid signature", { status: 403 });

/** TTS the text via Sarvam (falls back to Twilio <Say> on failure) and return the TwiML verb. */
export async function speak(text: string, ctx: VoiceCtx): Promise<string> {
  if (!text.trim()) return "";
  try {
    const audio = await textToSpeech(text, { languageCode: ctx.language, speaker: ctx.voice });
    return `<Play>${esc(`${appUrl()}/api/voice/tts?id=${putAudio(audio)}`)}</Play>`;
  } catch (e) {
    console.error("[voice] TTS failed", e);
    return `<Say>${esc(text)}</Say>`;
  }
}

export function turnUrl(callId: string, empty = 0) {
  return `${appUrl()}/api/voice/turn?callId=${encodeURIComponent(callId)}&e=${empty}`;
}

/** Speak, then record the caller's next utterance; if nothing is recorded, redirect back as an empty turn. */
export async function speakAndListen(text: string, ctx: VoiceCtx, callId: string, empty = 0) {
  const play = await speak(text, ctx);
  // `e` = consecutive empty turns so far (+1); only used by /turn when the transcript comes back empty.
  const next = esc(turnUrl(callId, empty + 1));
  return twimlResponse(
    `${play}<Record action="${next}" method="POST" playBeep="false" timeout="2" maxLength="30" trim="trim-silence"/><Redirect method="POST">${next}</Redirect>`
  );
}

export async function speakAndHangup(text: string, ctx: VoiceCtx) {
  return twimlResponse(`${await speak(text, ctx)}<Hangup/>`);
}

export async function speakAndDial(text: string, ctx: VoiceCtx, to: string, callerId: string) {
  return twimlResponse(`${await speak(text, ctx)}<Dial callerId="${esc(callerId)}" timeout="25">${esc(to)}</Dial>`);
}
