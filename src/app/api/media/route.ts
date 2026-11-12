// Upload a file to the tenant's media library. Body = raw file bytes, Content-Type = file mime (allow-listed).
import { db } from "@/db";
import { mediaFiles } from "@/db/schema";
import { getTenantId } from "@/lib/tenant";
import { deleteFile, isMediaMime, kindOf, maxBytesFor, newPublicId, readHead, saveStream, sniffMime } from "@/lib/media/storage";

export async function POST(req: Request) {
  const tenantId = await getTenantId();
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const mime = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!isMediaMime(mime)) return Response.json({ error: "Only PNG, JPEG, WebP, GIF, MP4, WebM or MOV files are allowed" }, { status: 415 });
  const max = maxBytesFor(mime);
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > max) return Response.json({ error: `File is larger than ${max / 1024 / 1024} MB` }, { status: 413 });
  if (!req.body) return Response.json({ error: "Empty upload" }, { status: 400 });

  const publicId = newPublicId();
  let sizeBytes: number;
  try {
    sizeBytes = await saveStream(tenantId, publicId, mime, req.body, max);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 413 });
  }
  // Make sure the bytes really are the declared kind of media (served with this Content-Type later).
  const sniffed = sniffMime(await readHead(tenantId, publicId, mime));
  if (!sizeBytes || !sniffed || kindOf(sniffed) !== kindOf(mime)) {
    await deleteFile(tenantId, publicId, mime);
    return Response.json({ error: "The file content does not match its type" }, { status: 415 });
  }
  let name: string | null = null;
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") || "").slice(0, 200) || null;
  } catch {}
  const [row] = await db
    .insert(mediaFiles)
    .values({ tenantId, publicId, kind: kindOf(mime), mime, sizeBytes, source: "upload", prompt: name, status: "ready" })
    .returning({ id: mediaFiles.id });
  return Response.json({ id: row.id, publicId });
}
