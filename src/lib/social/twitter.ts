import { createHmac, randomBytes } from "node:crypto";
import type { ProviderConfig } from "@/lib/integrations";
import { checkInput, download, errMsg, readJson, sleep, tfetch, type PostInput, type PostResult } from "./util";

const API = "https://api.x.com/2";
const CHUNK = 4 * 1024 * 1024;

type Creds = ProviderConfig["twitter"];

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** OAuth 1.0a (HMAC-SHA1) Authorization header. Only query params are signed (JSON / multipart bodies are not). */
export function oauthHeader(c: Creds, method: string, url: string) {
  const u = new URL(url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: c.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: c.accessToken,
    oauth_version: "1.0",
  };
  const params: [string, string][] = [...Object.entries(oauth), ...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]);
  params.sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1));
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(params.map(([k, v]) => `${k}=${v}`).join("&"))].join("&");
  const signature = createHmac("sha1", `${enc(c.apiSecret)}&${enc(c.accessSecret)}`).update(base).digest("base64");
  return "OAuth " + Object.entries({ ...oauth, oauth_signature: signature }).map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(", ");
}

function xfetch(c: Creds, method: string, url: string, body?: BodyInit, json = false, timeout = 60_000) {
  const h: Record<string, string> = { Authorization: oauthHeader(c, method, url) };
  if (json) h["Content-Type"] = "application/json";
  return tfetch(url, { method, headers: h, body }, timeout);
}

type ProcessingInfo = { state: "pending" | "in_progress" | "succeeded" | "failed"; check_after_secs?: number; error?: { message?: string } };

async function uploadMedia(c: Creds, url: string, kind: "image" | "video"): Promise<string> {
  const { bytes, contentType } = await download(url);
  if (kind === "image" && contentType === "image/gif" && bytes.length > 15 * 1024 * 1024) throw new Error("X GIFs must be 15 MB or smaller");
  if (kind === "image" && contentType !== "image/gif" && bytes.length > 5 * 1024 * 1024) throw new Error("X images must be 5 MB or smaller");
  if (kind === "video" && bytes.length > 512 * 1024 * 1024) throw new Error("X videos must be 512 MB or smaller");
  const category = kind === "video" ? "tweet_video" : contentType === "image/gif" ? "tweet_gif" : "tweet_image";
  const init = await readJson<{ data: { id: string } }>(
    await xfetch(c, "POST", `${API}/media/upload/initialize`, JSON.stringify({ media_type: contentType, total_bytes: bytes.length, media_category: category }), true),
    "X media init"
  );
  const id = init.data.id;
  for (let i = 0, seg = 0; i < bytes.length; i += CHUNK, seg++) {
    const form = new FormData();
    form.append("segment_index", String(seg));
    form.append("media", new Blob([new Uint8Array(bytes.subarray(i, i + CHUNK))], { type: "application/octet-stream" }), "chunk");
    const res = await xfetch(c, "POST", `${API}/media/upload/${id}/append`, form, false, 120_000);
    if (!res.ok) throw new Error(`X media append ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const fin = await readJson<{ data: { id: string; processing_info?: ProcessingInfo } }>(
    await xfetch(c, "POST", `${API}/media/upload/${id}/finalize`),
    "X media finalize"
  );
  let info = fin.data.processing_info;
  for (let i = 0; info && info.state !== "succeeded"; i++) {
    if (info.state === "failed") throw new Error(`X media processing failed: ${info.error?.message || "unknown"}`);
    if (i >= 60) throw new Error("X media is still processing — try again later");
    await sleep(Math.min(Math.max(info.check_after_secs ?? 2, 1), 10) * 1000);
    const st = await readJson<{ data: { processing_info?: ProcessingInfo } }>(
      await xfetch(c, "GET", `${API}/media/upload?command=STATUS&media_id=${id}`),
      "X media status"
    );
    info = st.data.processing_info;
  }
  return id;
}

export async function post(c: Creds, input: PostInput): Promise<PostResult> {
  try {
    const bad = checkInput("twitter", input);
    if (bad) return { ok: false, error: bad };
    if (!c.apiKey || !c.apiSecret || !c.accessToken || !c.accessSecret) return { ok: false, error: "X credentials incomplete (apiKey, apiSecret, accessToken, accessSecret)" };
    const body: { text: string; media?: { media_ids: string[] } } = { text: input.content };
    if (input.mediaType !== "text") body.media = { media_ids: [await uploadMedia(c, input.mediaUrl!, input.mediaType)] };
    const res = await readJson<{ data: { id: string } }>(await xfetch(c, "POST", `${API}/tweets`, JSON.stringify(body), true), "X post");
    // The X API v2 media upload has no documented custom video thumbnail, so a cover is never sent.
    return { ok: true, id: res.data.id, ...(input.mediaType === "video" && input.thumbnailUrl && { note: "Thumbnail not applied: X does not support custom video thumbnails through the API" }) };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
