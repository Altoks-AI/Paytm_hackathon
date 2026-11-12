import { randomBytes } from "crypto";

// Short-lived in-memory store for generated TTS audio served to Twilio <Play>.
// Ids are unguessable random tokens, so no raw text is ever exposed in a public URL.
type Entry = { audio: Buffer; expires: number };
const g = globalThis as unknown as { __voiceAudio?: Map<string, Entry> };
const store = (g.__voiceAudio ??= new Map<string, Entry>());
const TTL_MS = 10 * 60 * 1000;

export function putAudio(audio: Buffer): string {
  const now = Date.now();
  for (const [k, v] of store) if (v.expires < now) store.delete(k);
  const id = randomBytes(18).toString("base64url");
  store.set(id, { audio, expires: now + TTL_MS });
  return id;
}

export function getAudio(id: string): Buffer | null {
  const e = store.get(id);
  if (!e) return null;
  if (e.expires < Date.now()) {
    store.delete(id);
    return null;
  }
  return e.audio;
}
