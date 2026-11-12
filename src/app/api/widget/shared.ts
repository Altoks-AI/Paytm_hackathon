import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents as agentSettings } from "@/db/schema";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { ...cors, "Cache-Control": "no-store" } });

export const preflight = () => new Response(null, { status: 204, headers: cors });

export async function settingsByKey(key: string | null | undefined) {
  if (!key || key.length > 100) return null;
  const [s] = await db.select().from(agentSettings).where(eq(agentSettings.widgetKey, key));
  return s ?? null;
}

export const validSession = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);

// Simple in-memory sliding window: max N requests per window per bucket.
const g = globalThis as unknown as { __widgetRl?: Map<string, number[]> };
const buckets = (g.__widgetRl ??= new Map<string, number[]>());
export function rateLimited(bucket: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const hits = (buckets.get(bucket) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(bucket, hits);
  if (buckets.size > 10_000) for (const k of [...buckets.keys()].slice(0, 2000)) buckets.delete(k);
  return hits.length > max;
}
