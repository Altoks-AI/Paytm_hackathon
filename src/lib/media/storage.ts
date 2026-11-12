// Media bytes on disk: {MEDIA_DIR}/{tenantId}/{publicId}.{ext}. MEDIA_DIR defaults to ./.media (a Railway volume in prod).
// Paths are only ever built from validated ids (uuid tenant id, hex public id) and an allow-listed mime.
import { randomBytes } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, open, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";

export const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
} as const;
export type MediaMime = keyof typeof MIME_EXT;

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export const isMediaMime = (m: string): m is MediaMime => Object.hasOwn(MIME_EXT, m);
export const kindOf = (m: MediaMime): "image" | "video" => (m.startsWith("video/") ? "video" : "image");
export const maxBytesFor = (m: MediaMime) => (kindOf(m) === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
export const newPublicId = () => randomBytes(16).toString("hex");
export const isPublicId = (s: string) => /^[0-9a-f]{32,64}$/.test(s);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const root = () => path.resolve(process.env.MEDIA_DIR || ".media");

export function mediaPath(tenantId: string, publicId: string, mime: string) {
  if (!UUID.test(tenantId) || !isPublicId(publicId) || !isMediaMime(mime)) throw new Error("Invalid media path");
  return path.join(root(), tenantId.toLowerCase(), `${publicId}.${MIME_EXT[mime]}`);
}

/** Detect the mime type from magic bytes (for provider output that may not declare it). */
export function sniffMime(b: Uint8Array): MediaMime | null {
  const hex = Buffer.from(b.subarray(0, 12)).toString("hex");
  const ascii = Buffer.from(b.subarray(0, 12)).toString("latin1");
  if (hex.startsWith("89504e47")) return "image/png";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (ascii.startsWith("GIF8")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (hex.startsWith("1a45dfa3")) return "video/webm";
  if (ascii.slice(4, 8) === "ftyp") return ascii.slice(8, 10) === "qt" ? "video/quicktime" : "video/mp4";
  return null;
}

export async function saveBuffer(tenantId: string, publicId: string, mime: string, data: Uint8Array) {
  const file = mediaPath(tenantId, publicId, mime);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return data.byteLength;
}

/** Stream a web body to disk, aborting (and removing the partial file) past maxBytes. Returns bytes written. */
export async function saveStream(tenantId: string, publicId: string, mime: string, body: WebReadableStream<Uint8Array> | ReadableStream<Uint8Array>, maxBytes: number) {
  const file = mediaPath(tenantId, publicId, mime);
  await mkdir(path.dirname(file), { recursive: true });
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      cb(size > maxBytes ? new Error(`File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`) : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as WebReadableStream<Uint8Array>), limit, createWriteStream(file));
  } catch (e) {
    await rm(file, { force: true });
    throw e;
  }
  return size;
}

/** First n bytes of a stored file (for content sniffing). */
export async function readHead(tenantId: string, publicId: string, mime: string, n = 16) {
  const fh = await open(mediaPath(tenantId, publicId, mime), "r");
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export async function fileSize(tenantId: string, publicId: string, mime: string) {
  return (await stat(mediaPath(tenantId, publicId, mime))).size;
}

/** Web stream of the file (optionally a byte range, inclusive). */
export function readStream(tenantId: string, publicId: string, mime: string, range?: { start: number; end: number }) {
  return Readable.toWeb(createReadStream(mediaPath(tenantId, publicId, mime), range)) as ReadableStream<Uint8Array>;
}

export async function deleteFile(tenantId: string, publicId: string, mime: string) {
  if (isMediaMime(mime)) await rm(mediaPath(tenantId, publicId, mime), { force: true });
}
