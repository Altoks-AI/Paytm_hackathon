// Customer attachments (WhatsApp images/PDFs/voice notes), served only to the signed-in tenant that owns them.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { getTenantId } from "@/lib/tenant";
import { isPublicId } from "@/lib/media/storage";
import { attachmentSize, attachmentStream } from "@/lib/media/attachments";

export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  const tenantId = await getTenantId();
  if (!tenantId) return new Response("Unauthorized", { status: 401 });
  const { publicId } = await ctx.params;
  if (!isPublicId(publicId)) return new Response("Not found", { status: 404 });
  const [row] = await db
    .select({ a: messages.attachment })
    .from(messages)
    .where(and(eq(messages.tenantId, tenantId), sql`${messages.attachment}->>'id' = ${publicId}`))
    .limit(1);
  const a = row?.a;
  if (!a) return new Response("Not found", { status: 404 });
  let size: number;
  try {
    size = await attachmentSize(tenantId, a);
  } catch {
    return new Response("File no longer available", { status: 404 });
  }
  const download = new URL(req.url).searchParams.has("download");
  const name = (a.filename || `${a.kind}-${publicId.slice(0, 8)}`).replace(/[^\w.\- ]/g, "_");
  const headers: Record<string, string> = {
    "Content-Type": a.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range")?.trim() ?? "");
  if (m && (m[1] || m[2]) && size > 0) {
    const start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
    const end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = String(end - start + 1);
    return new Response(attachmentStream(tenantId, a, { start, end }), { status: 206, headers });
  }
  headers["Content-Length"] = String(size);
  return new Response(attachmentStream(tenantId, a), { status: 200, headers });
}
