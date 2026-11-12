// Public, unauthenticated media serving (social platforms fetch posts' media by URL). Access is by the unguessable publicId.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaFiles } from "@/db/schema";
import { fileSize, isPublicId, readStream } from "@/lib/media/storage";

async function serve(req: Request, publicId: string, head: boolean) {
  if (!isPublicId(publicId)) return new Response("Not found", { status: 404 });
  const [row] = await db
    .select({ tenantId: mediaFiles.tenantId, mime: mediaFiles.mime })
    .from(mediaFiles)
    .where(and(eq(mediaFiles.publicId, publicId), eq(mediaFiles.status, "ready")));
  if (!row) return new Response("Not found", { status: 404 });
  let size: number;
  try {
    size = await fileSize(row.tenantId, publicId, row.mime);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": row.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"${publicId}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range")?.trim() ?? "");
  if (m && (m[1] || m[2]) && size > 0) {
    let start: number, end: number;
    if (m[1]) {
      start = +m[1];
      end = m[2] ? Math.min(+m[2], size - 1) : size - 1;
    } else {
      start = Math.max(0, size - +m[2]);
      end = size - 1;
    }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = String(end - start + 1);
    return new Response(head ? null : readStream(row.tenantId, publicId, row.mime, { start, end }), { status: 206, headers });
  }
  headers["Content-Length"] = String(size);
  return new Response(head ? null : readStream(row.tenantId, publicId, row.mime), { status: 200, headers });
}

export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  return serve(req, (await ctx.params).publicId, false);
}

export async function HEAD(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  return serve(req, (await ctx.params).publicId, true);
}
