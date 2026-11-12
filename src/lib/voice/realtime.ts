// Realtime voice: Twilio bidirectional Media Stream ⇄ Sarvam streaming STT ⇄ streaming LLM ⇄ Sarvam streaming TTS.
// Loaded by server.ts (tsx, outside Next's bundler): must not import next/*, next-auth or @/auth.
import WebSocket, { type RawData } from "ws";
import twilio from "twilio";
import { normalizeLanguage, resolveVoice, textToSpeech } from "@/lib/sarvam";
import { appUrl } from "@/lib/tenant-data";
import { runAgentStream } from "@/lib/agent/stream";
import type { RunAgentResult } from "@/lib/agent/types";
import { loadCall } from "./session";
import { verifyStreamToken } from "./stream-token";

const SARVAM_WS = "wss://api.sarvam.ai";
const STT_MODEL = process.env.SARVAM_STT_STREAM_MODEL || "saaras:v3";
const TTS_CODEC = process.env.SARVAM_TTS_STREAM_CODEC || "mulaw";
const STT_RATE = 16000;
const SILENCE_MS = 20_000;
const MAX_CALL_MS = 15 * 60_000;
const START_TIMEOUT_MS = 15_000;
const TTS_IDLE_MS = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const log = (msg: string, e?: unknown) => console.error(`[voice-rt] ${msg}`, e instanceof Error ? e.message : (e ?? ""));
const key = () => process.env.SARVAM_API_KEY || "";
/** Flipped when Sarvam's streaming TTS returns a codec we can't play (e.g. mp3): use REST TTS per sentence instead. */
let streamTtsDisabled = false;

// ---------- G.711 mu-law + PCM helpers ----------

const MU_DECODE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4);
  MU_DECODE[i] = u & 0x80 ? 0x84 - t : t - 0x84;
}

function muEncode(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, sample | 0));
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  s = Math.min(s, 32635) + 0x84;
  let exp = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exp > 0; exp--, mask >>= 1);
  return ~(sign | (exp << 4) | ((s >> (exp + 3)) & 0x0f)) & 0xff;
}

/** mu-law 8 kHz → PCM16LE 16 kHz (linear interpolation). */
function mulaw8kToPcm16k(mu: Buffer, prev: { last: number }): Buffer {
  const out = Buffer.alloc(mu.length * 4);
  for (let i = 0; i < mu.length; i++) {
    const s = MU_DECODE[mu[i]];
    out.writeInt16LE((prev.last + s) >> 1, i * 4);
    out.writeInt16LE(s, i * 4 + 2);
    prev.last = s;
  }
  return out;
}

/** PCM16LE at `rate` → mu-law 8 kHz. */
function pcm16ToMulaw8k(pcm: Buffer, rate: number): Buffer {
  const n = pcm.length >> 1;
  if (rate === 8000) {
    const out = Buffer.alloc(n);
    for (let i = 0; i < n; i++) out[i] = muEncode(pcm.readInt16LE(i * 2));
    return out;
  }
  const ratio = rate / 8000;
  const len = Math.floor(n / ratio);
  const out = Buffer.alloc(len);
  for (let j = 0; j < len; j++) {
    // average over the source window (cheap low-pass) to limit aliasing
    const a = Math.floor(j * ratio);
    const b = Math.min(n, Math.max(a + 1, Math.floor((j + 1) * ratio)));
    let sum = 0;
    for (let k = a; k < b; k++) sum += pcm.readInt16LE(k * 2);
    out[j] = muEncode(sum / (b - a));
  }
  return out;
}

type AudioFmt = { kind: "mulaw" | "pcm"; rate: number };

/** Parse a WAV header; returns its format and the data payload (tolerates streaming headers with bogus sizes). */
function parseWav(buf: Buffer): { fmt: AudioFmt; data: Buffer } | null {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
  let off = 12;
  let fmt: AudioFmt = { kind: "pcm", rate: 8000 };
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      const format = buf.readUInt16LE(off + 8);
      fmt = { kind: format === 7 ? "mulaw" : "pcm", rate: buf.readUInt32LE(off + 12) };
    } else if (id === "data") {
      return { fmt, data: buf.subarray(off + 8, Math.min(buf.length, off + 8 + size)) };
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

/** Converts Sarvam audio chunks (mulaw / linear16 / wav) into mu-law 8k for Twilio. Returns null for unsupported types. */
class AudioDecoder {
  private fmt: AudioFmt | null = null;
  private carry: Buffer = Buffer.alloc(0);
  decode(b64: string, contentType = ""): Buffer | null {
    let buf: Buffer = Buffer.from(b64, "base64");
    const ct = contentType.toLowerCase();
    const wav = parseWav(buf);
    if (wav) {
      this.fmt = wav.fmt;
      buf = wav.data;
    } else if (!this.fmt) {
      if (/mulaw|ulaw|basic|pcmu/.test(ct) || (!ct && TTS_CODEC === "mulaw")) this.fmt = { kind: "mulaw", rate: 8000 };
      else if (/l16|linear16|pcm|raw|wav/.test(ct) || (!ct && TTS_CODEC === "linear16")) this.fmt = { kind: "pcm", rate: Number(/rate=(\d+)/.exec(ct)?.[1]) || 8000 };
      else return null;
    }
    if (this.fmt.kind === "mulaw") {
      return this.fmt.rate === 8000 ? buf : pcm16ToMulaw8k(Buffer.from(Int16Array.from(buf, (b) => MU_DECODE[b]).buffer), this.fmt.rate);
    }
    if (this.carry.length) buf = Buffer.concat([this.carry, buf]);
    const even = buf.length & ~1;
    this.carry = buf.subarray(even);
    return pcm16ToMulaw8k(buf.subarray(0, even), this.fmt.rate);
  }
}

// ---------- Sarvam streaming STT ----------

type SttHandlers = { onSpeechStart(): void; onSpeechEnd(): void; onTranscript(text: string, lang: string | null): void; onFatal(): void };

class SarvamStt {
  private ws: WebSocket | null = null;
  private closed = false;
  private failures = 0;
  private batch: Buffer[] = [];
  private batchLen = 0;
  private interp = { last: 0 };
  constructor(private language: string, private h: SttHandlers) {
    this.connect();
  }

  private connect() {
    const q = new URLSearchParams({
      "language-code": this.language,
      model: STT_MODEL,
      mode: "transcribe",
      sample_rate: String(STT_RATE),
      input_audio_codec: "pcm_s16le",
      vad_signals: "true",
    });
    const ws = new WebSocket(`${SARVAM_WS}/speech-to-text/ws?${q}`, { headers: { "Api-Subscription-Key": key() } });
    this.ws = ws;
    ws.on("open", () => (this.failures = 0));
    ws.on("message", (raw) => {
      try {
        const m = JSON.parse(raw.toString()) as { type?: string; data?: { transcript?: string; language_code?: string | null; signal_type?: string; error?: string } };
        if (m.type === "events") {
          if (m.data?.signal_type === "START_SPEECH") this.h.onSpeechStart();
          else if (m.data?.signal_type === "END_SPEECH") this.h.onSpeechEnd();
        } else if (m.type === "data") {
          this.h.onTranscript((m.data?.transcript || "").trim(), m.data?.language_code ?? null);
        } else if (m.type === "error") {
          log("STT error", m.data?.error);
        }
      } catch (e) {
        log("STT message", e);
      }
    });
    ws.on("error", (e) => log("STT socket", e));
    ws.on("close", () => {
      if (this.closed || this.ws !== ws) return;
      if (++this.failures > 3) return this.h.onFatal();
      setTimeout(() => !this.closed && this.connect(), 300 * this.failures);
    });
  }

  /** Feed one Twilio media frame (mu-law 8 kHz); sends ~100 ms batches as PCM16 16 kHz. */
  send(mu: Buffer) {
    this.batch.push(mu);
    this.batchLen += mu.length;
    if (this.batchLen < 800) return;
    const pcm = mulaw8kToPcm16k(Buffer.concat(this.batch), this.interp);
    this.batch = [];
    this.batchLen = 0;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ audio: { data: pcm.toString("base64"), sample_rate: STT_RATE, encoding: "audio/wav" } }));
    }
  }

  close() {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {}
  }
}

// ---------- Sarvam TTS (streaming WebSocket, REST fallback) for one agent turn ----------

class TurnSpeaker {
  private ws: WebSocket | null = null;
  private sentences: string[] = [];
  private sentToWs = 0;
  private finals = 0;
  private restFrom = -1; // index from which sentences are spoken via REST
  private restChain: Promise<void> = Promise.resolve();
  private decoder = new AudioDecoder();
  private lastAudio = Date.now();
  private closed = false;
  private wake: (() => void) | null = null;
  private readonly voice: { model: string; speaker: string };
  private readonly lang: string;

  constructor(private sess: CallSession, lang: string, voice: string, private signal: AbortSignal) {
    this.voice = resolveVoice(voice);
    this.lang = normalizeLanguage(lang);
    if (streamTtsDisabled || !key()) this.restFrom = 0;
    else this.open();
  }

  private open() {
    const q = new URLSearchParams({ model: this.voice.model, send_completion_event: "true" });
    const ws = new WebSocket(`${SARVAM_WS}/text-to-speech/ws?${q}`, { headers: { "Api-Subscription-Key": key() } });
    this.ws = ws;
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "config",
          data: { language_code: this.lang, speaker: this.voice.speaker, speech_sample_rate: 8000, output_audio_codec: TTS_CODEC, min_buffer_size: 30, max_chunk_length: 150 },
        })
      );
      this.pump();
    });
    ws.on("message", (raw) => {
      if (this.closed || this.restFrom >= 0) return;
      try {
        const m = JSON.parse(raw.toString()) as { type?: string; data?: { audio?: string; content_type?: string; event_type?: string; message?: string } };
        if (m.type === "audio" && m.data?.audio) {
          const mu = this.decoder.decode(m.data.audio, m.data.content_type);
          if (!mu) {
            log(`streaming TTS returned unsupported audio (${m.data.content_type}); using REST TTS`);
            streamTtsDisabled = true;
            return this.fallback();
          }
          this.lastAudio = Date.now();
          this.sess.play(mu);
        } else if (m.type === "event" && m.data?.event_type === "final") {
          this.finals++;
          this.lastAudio = Date.now();
          this.wake?.();
        } else if (m.type === "error") {
          log("TTS error", m.data?.message);
          this.fallback();
        }
      } catch (e) {
        log("TTS message", e);
      }
    });
    ws.on("error", (e) => {
      log("TTS socket", e);
      this.fallback();
    });
    ws.on("close", () => !this.closed && this.fallback());
  }

  private pump() {
    if (this.ws?.readyState !== WebSocket.OPEN || this.restFrom >= 0) return;
    while (this.sentToWs < this.sentences.length) {
      this.ws.send(JSON.stringify({ type: "text", data: { text: this.sentences[this.sentToWs++] } }));
      this.ws.send(JSON.stringify({ type: "flush" }));
      this.lastAudio = Date.now();
    }
  }

  /** Switch to REST TTS for every sentence not yet completed by the stream. */
  private fallback() {
    if (this.closed || this.restFrom >= 0) return;
    this.restFrom = Math.min(this.finals, this.sentences.length);
    try {
      this.ws?.close();
    } catch {}
    for (let i = this.restFrom; i < this.sentences.length; i++) this.rest(this.sentences[i]);
    this.wake?.();
  }

  private rest(text: string) {
    const audio = textToSpeech(text, { languageCode: this.lang, speaker: this.voice.speaker, sampleRate: 8000 });
    audio.catch(() => {});
    this.restChain = this.restChain.then(async () => {
      try {
        const wav = await audio;
        if (this.closed || this.signal.aborted) return;
        const parsed = parseWav(wav);
        if (parsed) this.sess.play(parsed.fmt.kind === "mulaw" ? parsed.data : pcm16ToMulaw8k(parsed.data, parsed.fmt.rate));
      } catch (e) {
        log("REST TTS", e);
      }
    });
  }

  say(text: string) {
    if (this.closed || this.signal.aborted || !text.trim()) return;
    this.sentences.push(text);
    if (this.restFrom >= 0) this.rest(text);
    else this.pump();
  }

  /** Resolves once all audio for this turn has been generated and played (or the turn was aborted). */
  async finish() {
    while (!this.closed && !this.signal.aborted) {
      if (this.restFrom >= 0) {
        await this.restChain;
        break;
      }
      if (this.finals >= this.sentences.length) break;
      if (Date.now() - this.lastAudio > TTS_IDLE_MS) break; // completion events missing: assume done
      await new Promise<void>((r) => {
        this.wake = r;
        setTimeout(r, 500);
      });
      this.wake = null;
    }
    await this.restChain;
    if (!this.signal.aborted) await this.sess.played();
  }

  close() {
    this.closed = true;
    this.wake?.();
    try {
      this.ws?.close();
    } catch {}
  }
}

// ---------- Call session ----------

type Loaded = NonNullable<Awaited<ReturnType<typeof loadCall>>>;
type TwilioMsg = { event: string; streamSid?: string; start?: { callSid?: string; streamSid?: string; customParameters?: Record<string, string> }; media?: { track?: string; payload?: string }; mark?: { name?: string } };

class CallSession {
  private data: Loaded | null = null;
  private streamSid = "";
  private stt: SarvamStt | null = null;
  private turn: { ac: AbortController; speaker: TurnSpeaker } | null = null;
  private marks = new Set<string>();
  private markSeq = 0;
  private waiters: (() => void)[] = [];
  private lang = "en-IN";
  private allowed: string[] = [];
  private finishing = false;
  private closed = false;
  private userSpeaking = false;
  private lastActivity = Date.now();
  private silencePrompts = 0;
  private timers: NodeJS.Timeout[] = [];

  constructor(private ws: WebSocket) {
    ws.on("message", (raw) => this.onMessage(raw).catch((e) => log("message handler", e)));
    ws.on("close", () => this.close());
    ws.on("error", (e) => {
      log("twilio socket", e);
      this.close();
    });
    this.timers.push(setTimeout(() => !this.data && this.reject("no start event"), START_TIMEOUT_MS));
  }

  private send(msg: object) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Queue mu-law 8k audio to Twilio followed by a mark so we know when it has played. */
  play(mu: Buffer) {
    if (this.closed || !mu.length) return;
    this.send({ event: "media", streamSid: this.streamSid, media: { payload: mu.toString("base64") } });
    const name = `m${++this.markSeq}`;
    this.marks.add(name);
    this.send({ event: "mark", streamSid: this.streamSid, mark: { name } });
  }

  /** Resolves when all queued audio has been played (or cleared). */
  played() {
    if (!this.marks.size || this.closed) return Promise.resolve();
    return new Promise<void>((r) => this.waiters.push(r));
  }

  private onMark(name: string) {
    this.marks.delete(name);
    this.touch();
    if (!this.marks.size) this.waiters.splice(0).forEach((r) => r());
  }

  private touch() {
    this.lastActivity = Date.now();
  }

  private async onMessage(raw: RawData) {
    if (this.closed) return;
    const msg = JSON.parse(raw.toString()) as TwilioMsg;
    switch (msg.event) {
      case "start":
        return this.start(msg);
      case "media":
        if (this.stt && msg.media?.payload && (msg.media.track ?? "inbound") === "inbound") this.stt.send(Buffer.from(msg.media.payload, "base64"));
        return;
      case "mark":
        if (msg.mark?.name) this.onMark(msg.mark.name);
        return;
      case "stop":
        return this.close();
    }
  }

  private reject(reason: string) {
    log(`rejecting stream: ${reason}`);
    try {
      this.ws.close(1008, reason);
    } catch {}
    this.close();
  }

  private async start(msg: TwilioMsg) {
    if (this.data) return;
    const cp = msg.start?.customParameters ?? {};
    const callSid = msg.start?.callSid || "";
    const callId = cp.callId || "";
    if (!UUID.test(callId) || !callSid || !verifyStreamToken(callId, callSid, cp.token || "")) return this.reject("unauthorized");
    let loaded: Awaited<ReturnType<typeof loadCall>> = null;
    try {
      loaded = await loadCall({ id: callId });
    } catch (e) {
      log("load call", e);
      return this.reject("unavailable");
    }
    if (!loaded || loaded.call.callSid !== callSid || !loaded.call.conversationId) return this.reject("unknown call");
    if (this.closed) return;
    this.data = loaded;
    this.streamSid = msg.start?.streamSid || msg.streamSid || "";
    const s = loaded.settings;
    this.lang = normalizeLanguage(s?.language);
    this.allowed = [this.lang, ...(s?.extraLanguages ?? [])];
    const multilingual = (s?.extraLanguages ?? []).some((l) => l !== this.lang);

    this.stt = new SarvamStt(multilingual ? "unknown" : this.lang, {
      onSpeechStart: () => {
        this.userSpeaking = true;
        this.touch();
        if (this.marks.size) this.bargeIn(); // caller talks over playing audio
      },
      onSpeechEnd: () => {
        this.userSpeaking = false;
        this.touch();
      },
      onTranscript: (text, lang) => {
        this.userSpeaking = false;
        this.touch();
        if (!text || this.finishing) return;
        this.silencePrompts = 0;
        if (multilingual && lang && this.allowed.includes(lang)) this.lang = lang;
        this.bargeIn();
        void this.runTurn({ userMessage: text });
      },
      onFatal: () => void this.fallbackToTurns(),
    });
    this.timers.push(setInterval(() => this.tick(), 1000));
    this.timers.push(setTimeout(() => void this.finishWith("We've reached the maximum call length. Thank you for calling. Goodbye."), MAX_CALL_MS));

    if (loaded.call.direction === "outbound") void this.runTurn({});
    else void this.runTurn({ text: s?.greeting || "Hi! How can I help you today?" });
  }

  private tick() {
    if (!this.data || this.finishing || this.turn || this.userSpeaking || this.marks.size) return;
    if (Date.now() - this.lastActivity < SILENCE_MS) return;
    this.touch();
    if (++this.silencePrompts >= 2) void this.finishWith("I haven't heard anything, so I'll end the call now. Feel free to call again. Goodbye.");
    else void this.runTurn({ text: "Are you still there?" });
  }

  /** Stop current playback and generation (caller interrupted). */
  private bargeIn() {
    if (this.finishing) return;
    const t = this.turn;
    this.turn = null;
    if (t) {
      t.ac.abort();
      t.speaker.close();
    }
    if (this.marks.size) this.send({ event: "clear", streamSid: this.streamSid });
  }

  private async runTurn(opts: { userMessage?: string; text?: string; then?: "hangup" }) {
    const d = this.data;
    if (!d || this.closed) return;
    const ac = new AbortController();
    const speaker = new TurnSpeaker(this, this.lang, d.settings?.voice || "", ac.signal);
    const turn = { ac, speaker };
    this.turn = turn;
    this.touch();
    try {
      let result: RunAgentResult = { reply: opts.text ?? "", handoff: false, ended: opts.then === "hangup" };
      if (opts.text !== undefined) speaker.say(opts.text);
      else {
        result = await runAgentStream(
          {
            tenantId: d.call.tenantId,
            conversationId: d.call.conversationId!,
            channel: "voice",
            callDirection: d.call.direction === "outbound" ? "outbound" : "inbound",
            objective: d.call.objective ?? undefined,
            userMessage: opts.userMessage,
          },
          { onText: (s) => speaker.say(s), signal: ac.signal }
        );
      }
      if (ac.signal.aborted) return;
      if (result.handoff || result.ended) this.finishing = true; // ignore barge-in while wrapping up
      await speaker.finish();
      if (ac.signal.aborted || this.closed) return;
      if (result.handoff) await this.handoff();
      else if (result.ended) await this.hangup();
    } catch (e) {
      if (!ac.signal.aborted) log("turn failed", e);
    } finally {
      speaker.close();
      if (this.turn === turn) this.turn = null;
      this.touch();
    }
  }

  private async updateCall(params: { twiml?: string; status?: "completed" }) {
    const d = this.data;
    if (!d) return;
    try {
      await twilio(d.twilio.accountSid, d.twilio.authToken).calls(d.call.callSid).update(params);
    } catch (e) {
      log("twilio call update", e);
    }
  }

  private async hangup() {
    this.finishing = true;
    await this.updateCall({ status: "completed" });
    this.close();
  }

  private async finishWith(text: string) {
    if (this.finishing || this.closed) return;
    this.bargeIn();
    this.finishing = true;
    await this.runTurn({ text, then: "hangup" });
  }

  private async handoff() {
    const d = this.data!;
    const to = d.settings?.handoffPhone;
    if (!to) {
      this.finishing = false;
      return this.finishWith("A member of our team will call you back shortly. Goodbye.");
    }
    this.finishing = true;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    await this.updateCall({ twiml: `<Response><Dial callerId="${esc(d.twilio.phoneNumber)}" timeout="25">${esc(to)}</Dial></Response>` });
    this.close();
  }

  /** Streaming STT unavailable: hand the call back to the turn-based HTTP loop. */
  private async fallbackToTurns() {
    if (this.closed || !this.data) return;
    log("streaming STT unavailable; falling back to turn-based voice");
    this.finishing = true;
    const url = `${appUrl()}/api/voice/turn?callId=${encodeURIComponent(this.data.call.id)}&e=0`;
    await this.updateCall({ twiml: `<Response><Redirect method="POST">${url.replace(/&/g, "&amp;")}</Redirect></Response>` });
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.timers.forEach((t) => clearTimeout(t));
    this.turn?.ac.abort();
    this.turn?.speaker.close();
    this.turn = null;
    this.stt?.close();
    this.waiters.splice(0).forEach((r) => r());
    try {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) this.ws.close();
    } catch {}
  }
}

/** Entry point for each Twilio Media Streams WebSocket connection on /voice-stream. Never throws. */
export function handleVoiceStream(ws: WebSocket) {
  try {
    new CallSession(ws);
  } catch (e) {
    log("session init", e);
    try {
      ws.close(1011);
    } catch {}
  }
}
