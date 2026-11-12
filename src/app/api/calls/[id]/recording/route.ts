import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { getTenantId } from "@/lib/tenant";
import { getIntegration } from "@/lib/integrations";

/** Stream a call recording (MP3) to the signed-in tenant. Twilio media needs account auth, so it is proxied here. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenantId = await getTenantId();
  if (!tenantId) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [call] = await db.select({ url: calls.recordingUrl }).from(calls).where(and(eq(calls.id, id), eq(calls.tenantId, tenantId)));
  const cfg = await getIntegration(tenantId, "twilio");
  if (!call?.url || !cfg) return new Response("Not found", { status: 404 });

  const range = req.headers.get("range");
  const res = await fetch(`${call.url}.mp3`, {
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`, ...(range ? { Range: range } : {}) },
  });
  if (!res.ok && res.status !== 206) return new Response("Recording unavailable", { status: 502 });
  const headers = new Headers({ "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes" });
  for (const h of ["content-length", "content-range"]) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (new URL(req.url).searchParams.has("download")) headers.set("Content-Disposition", `attachment; filename="call-${id}.mp3"`);
  return new Response(res.body, { status: res.status, headers });
}
