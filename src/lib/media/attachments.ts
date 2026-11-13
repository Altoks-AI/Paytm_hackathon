// Files customers send on WhatsApp (images, PDFs, voice notes), kept private to the tenant.
// Stored at {MEDIA_DIR}/{tenantId}/attachments/{publicId}.{ext}; served only to the signed-in tenant via /api/attachments/{publicId}.
import { createReadStream } from "fs";
import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { isPublicId, newPublicId } from "./storage";

export type Attachment = { id: string; kind: "image" | "audio" | "document"; mime: string; filename?: string; size: number };

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "application/pdf": "pdf",
  "text/plain": "txt",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const root = () => path.resolve(process.env.MEDIA_DIR || ".media");
const ext = (mime: string) => EXT[mime] ?? "bin";

function filePath(tenantId: string, publicId: string, mime: string) {
  if (!UUID.test(tenantId) || !isPublicId(publicId)) throw new Error("Invalid attachment path");
  return path.join(root(), tenantId.toLowerCase(), "attachments", `${publicId}.${ext(mime)}`);
}

export async function saveAttachment(tenantId: string, kind: Attachment["kind"], mime: string, bytes: Buffer, filename?: string): Promise<Attachment> {
  const id = newPublicId();
  const file = filePath(tenantId, id, mime);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return { id, kind, mime, size: bytes.length, ...(filename ? { filename: filename.slice(0, 200) } : {}) };
}

export async function attachmentSize(tenantId: string, a: Attachment) {
  return (await stat(filePath(tenantId, a.id, a.mime))).size;
}

export function attachmentStream(tenantId: string, a: Attachment, range?: { start: number; end: number }) {
  return Readable.toWeb(createReadStream(filePath(tenantId, a.id, a.mime), range)) as ReadableStream<Uint8Array>;
}
