// Sarvam AI speech APIs (https://docs.sarvam.ai). Auth header: api-subscription-key.
import { DEFAULT_VOICE, TTS_MODEL, VOICE_IDS } from "@/lib/voices";

const BASE = "https://api.sarvam.ai";

const LANGS = ["bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"];
const V3_SPEAKERS = new Set(
  "shubh aditya ritu priya neha rahul pooja rohan simran kavya amit dev ishita shreya ratan varun manan sumit roopa kabir aayan ashutosh advait anand tanya tarun sunny mani gokul vijay shruti suhani mohit kavitha rehan soham rupali".split(" ")
);
const TTS_MAX = 1500; // conservative chunk size (REST allows 2500)

function apiKey() {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new Error("SARVAM_API_KEY is not set");
  return k;
}

export function normalizeLanguage(code?: string | null) {
  return code && LANGS.includes(code) ? code : "en-IN";
}

/** Pick model + speaker: v4 persona ids → bulbul:v4-flash; legacy v3 names saved earlier → bulbul:v3; anything else → default v4 voice. */
export function resolveVoice(speaker?: string | null): { model: string; speaker: string } {
  const s = (speaker || "").trim().toLowerCase();
  if (VOICE_IDS.includes(s)) return { model: TTS_MODEL, speaker: s };
  if (V3_SPEAKERS.has(s)) return { model: "bulbul:v3", speaker: s };
  return { model: TTS_MODEL, speaker: DEFAULT_VOICE };
}

export async function speechToText(audio: Buffer | ArrayBuffer, mime = "audio/wav", languageCode?: string): Promise<string> {
  return (await transcribe(audio, mime, languageCode)).transcript;
}

/** STT that also returns the spoken language. Pass no languageCode to auto-detect (multilingual agents). */
export async function transcribe(audio: Buffer | ArrayBuffer, mime = "audio/wav", languageCode?: string): Promise<{ transcript: string; language: string | null }> {
  const form = new FormData();
  const bytes = audio instanceof ArrayBuffer ? new Uint8Array(audio) : new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
  form.append("file", new Blob([bytes as BlobPart], { type: mime }), `audio.${/mp3|mpeg/.test(mime) ? "mp3" : (mime.match(/ogg|opus|aac|flac|webm|amr|m4a|mp4/)?.[0] ?? "wav")}`);
  form.append("model", "saaras:v4");
  form.append("mode", "transcribe");
  form.append("language_code", languageCode && LANGS.includes(languageCode) ? languageCode : "unknown");
  const res = await fetch(`${BASE}/speech-to-text`, { method: "POST", headers: { "api-subscription-key": apiKey() }, body: form });
  if (!res.ok) throw new Error(`Sarvam STT ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { transcript?: string; language_code?: string | null };
  return { transcript: (data.transcript || "").trim(), language: data.language_code && LANGS.includes(data.language_code) ? data.language_code : null };
}

function chunkText(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const sentence of text.match(/[^.!?।]+[.!?।]*\s*/g) || [text]) {
    if ((cur + sentence).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += sentence.length > max ? sentence.slice(0, max) : sentence;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Concatenate PCM WAV files (same format) by summing their data chunks. */
function concatWav(wavs: Buffer[]): Buffer {
  if (wavs.length === 1) return wavs[0];
  const parts = wavs.map((w) => {
    let off = 12;
    while (off + 8 <= w.length) {
      const id = w.toString("ascii", off, off + 4);
      const size = w.readUInt32LE(off + 4);
      if (id === "data") return { header: w.subarray(0, off), data: w.subarray(off + 8, Math.min(w.length, off + 8 + size)) };
      off += 8 + size + (size % 2);
    }
    return { header: w.subarray(0, 44), data: w.subarray(44) };
  });
  const header = Buffer.from(parts[0].header);
  const data = Buffer.concat(parts.map((p) => p.data));
  header.writeUInt32LE(header.length + 8 + data.length - 8, 4);
  const len = Buffer.alloc(8);
  len.write("data", 0, "ascii");
  len.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, len, data]);
}

/** Text → WAV audio (8 kHz, telephony quality). */
export async function textToSpeech(text: string, opts: { languageCode?: string | null; speaker?: string | null; sampleRate?: number } = {}): Promise<Buffer> {
  const { model, speaker } = resolveVoice(opts.speaker);
  const chunks = chunkText(text.trim() || "...", TTS_MAX);
  const wavs = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await fetch(`${BASE}/text-to-speech`, {
        method: "POST",
        headers: { "api-subscription-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: chunk,
          language_code: normalizeLanguage(opts.languageCode),
          model,
          speaker,
          speech_sample_rate: opts.sampleRate ?? 8000,
          output_audio_codec: "wav",
        }),
      });
      if (!res.ok) throw new Error(`Sarvam TTS ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { audios?: string[] };
      return Buffer.concat((data.audios || []).map((a) => Buffer.from(a, "base64")));
    })
  );
  return concatWav(wavs);
}
