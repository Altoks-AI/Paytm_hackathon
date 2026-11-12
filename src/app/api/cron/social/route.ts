import { publishDuePosts } from "@/lib/social";
import { ensureScheduler } from "@/lib/social/scheduler";

async function handler(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  ensureScheduler();
  try {
    return Response.json(await publishDuePosts());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export { handler as GET, handler as POST };
