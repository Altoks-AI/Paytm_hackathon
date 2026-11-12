import { PLATFORM_LABEL, PLATFORM_MAX, PLATFORM_MEDIA, type MediaType, type Platform } from "./platforms";

export * from "./platforms";
export type PostInput = { content: string; mediaUrl?: string | null; mediaType: MediaType; title?: string | null; thumbnailUrl?: string | null };
/** `note`: a non-fatal caveat on a successful post (e.g. the thumbnail could not be applied). */
export type PostResult = { ok: boolean; id?: string; error?: string; note?: string };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with a timeout (default 30s). */
export function tfetch(url: string, init: RequestInit = {}, timeoutMs = 30_000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** Reads a response body as JSON (or text), throwing a readable error on non-2xx. */
export async function readJson<T = Record<string, unknown>>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }
  if (!res.ok) {
    const d = data as Record<string, unknown> | string;
    let msg = typeof d === "string" ? d : "";
    if (typeof d === "object" && d) {
      const e = d.error as Record<string, unknown> | string | undefined;
      msg =
        (typeof e === "object" && e ? String(e.message ?? e.error_user_msg ?? JSON.stringify(e)) : typeof e === "string" ? String(d.error_description ?? e) : "") ||
        String(d.detail ?? d.message ?? d.title ?? "") ||
        (Array.isArray(d.errors) ? (d.errors as Record<string, unknown>[]).map((x) => x.message ?? x.detail).join("; ") : "") ||
        JSON.stringify(d);
    }
    throw new Error(`${label} ${res.status}: ${msg.slice(0, 300)}`);
  }
  return data as T;
}

const MAX_MEDIA_BYTES = 300 * 1024 * 1024;

/** Downloads a public media URL server-side. */
export async function download(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const res = await tfetch(url, { redirect: "follow" }, 120_000);
  if (!res.ok) throw new Error(`Could not download media (${res.status})`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_MEDIA_BYTES) throw new Error("Media file is larger than 300 MB");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error("Downloaded media is empty");
  let contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType || contentType === "application/octet-stream") {
    const ext = new URL(url).pathname.split(".").pop()?.toLowerCase() || "";
    contentType =
      { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" }[ext] ||
      "application/octet-stream";
  }
  return { bytes, contentType };
}

/** Downloads a thumbnail image, checking its type against `types` and its size against maxBytes. */
export async function downloadImage(url: string, maxBytes: number, types: string[]): Promise<{ bytes: Buffer; contentType: string }> {
  const img = await download(url);
  if (!types.includes(img.contentType)) throw new Error(`thumbnail must be ${types.map((t) => t.split("/")[1].toUpperCase()).join(" or ")} (got ${img.contentType})`);
  if (img.bytes.length > maxBytes) throw new Error(`thumbnail must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller`);
  return img;
}

/** Title for platforms with a video title field: trimmed, at most `max` characters, or undefined. */
export const videoTitle = (input: PostInput, max: number) => {
  const t = input.title?.trim();
  return t ? [...t].slice(0, max).join("") : undefined;
};

/** Common validation; returns an error message or null. */
export function checkInput(p: Platform, input: PostInput, maxLen = PLATFORM_MAX[p]): string | null {
  if (!PLATFORM_MEDIA[p].includes(input.mediaType)) {
    const need = PLATFORM_MEDIA[p].filter((m) => m !== "text").join(" or ");
    return `${PLATFORM_LABEL[p]} does not support ${input.mediaType} posts — attach ${need}`;
  }
  if (input.mediaType !== "text" && !input.mediaUrl) return "Media URL is required for image/video posts";
  if ([...input.content].length > maxLen) return `${PLATFORM_LABEL[p]} allows at most ${maxLen} characters (got ${[...input.content].length})`;
  if (input.mediaType === "text" && !input.content.trim()) return "Post content is empty";
  return null;
}

export const errMsg = (e: unknown) =>
  e instanceof Error ? (e.name === "TimeoutError" || e.name === "AbortError" ? "Request timed out" : e.message) : String(e);
