import { and, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { socialPosts } from "@/db/schema";
import { getIntegration } from "@/lib/integrations";
import { addCredits, chargeCredits, CREDIT_COSTS, OUT_OF_CREDITS } from "@/lib/credits";
import * as facebook from "./facebook";
import * as instagram from "./instagram";
import * as linkedin from "./linkedin";
import * as twitter from "./twitter";
import * as youtube from "./youtube";
import { errMsg, isPlatform, PLATFORM_LABEL, type MediaType, type Platform, type PostInput, type PostResult } from "./util";

type Row = typeof socialPosts.$inferSelect;

async function postTo(tenantId: string, p: Platform, input: PostInput): Promise<PostResult> {
  try {
    const creds = await getIntegration(tenantId, p);
    if (!creds) return { ok: false, error: `${PLATFORM_LABEL[p]} is not connected — add credentials in Integrations` };
    switch (p) {
      case "linkedin":
        return await linkedin.post(creds as Parameters<typeof linkedin.post>[0], input);
      case "twitter":
        return await twitter.post(creds as Parameters<typeof twitter.post>[0], input);
      case "facebook":
        return await facebook.post(creds as Parameters<typeof facebook.post>[0], input);
      case "instagram":
        return await instagram.post(creds as Parameters<typeof instagram.post>[0], input);
      case "youtube":
        return await youtube.post(creds as Parameters<typeof youtube.post>[0], input);
    }
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** Publishes an already-claimed (status=posting) row. Platforms that already succeeded (on retry) are skipped. */
async function publishClaimed(row: Row) {
  const mediaType = row.mediaType as MediaType;
  const input: PostInput = {
    content: row.content,
    mediaUrl: row.mediaUrl,
    mediaType,
    title: mediaType === "video" ? row.title : null,
    thumbnailUrl: mediaType === "video" ? row.thumbnailUrl : null,
  };
  const results: Row["results"] = { ...row.results };
  delete results._error;
  const todo = row.platforms.filter((p) => !results[p]?.ok);
  await Promise.all(
    todo.map(async (p) => {
      if (!isPlatform(p)) results[p] = { ok: false, error: `Unknown platform ${p}` };
      else if (!(await chargeCredits(row.tenantId, "social_post", { note: PLATFORM_LABEL[p] }))) results[p] = { ok: false, error: OUT_OF_CREDITS };
      else {
        results[p] = await postTo(row.tenantId, p, input);
        if (!results[p].ok) await addCredits(row.tenantId, CREDIT_COSTS.social_post.cost, "refund", `${PLATFORM_LABEL[p]} post failed`);
      }
    })
  );
  const anyOk = row.platforms.some((p) => results[p]?.ok);
  await db
    .update(socialPosts)
    .set({ results, status: anyOk ? "posted" : "failed" })
    .where(and(eq(socialPosts.id, row.id), eq(socialPosts.tenantId, row.tenantId)));
  return { status: anyOk ? "posted" : "failed", results };
}

/** Atomically claims a tenant's post (draft/scheduled/failed → posting). Returns null if not found or already in progress. */
export async function claimPost(tenantId: string, postId: string) {
  const [row] = await db
    .update(socialPosts)
    .set({ status: "posting" })
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId), inArray(socialPosts.status, ["draft", "scheduled", "failed"])))
    .returning();
  return row ?? null;
}

/** Publishes a row returned by claimPost. Never throws. */
export async function publishClaimedPost(row: Row) {
  try {
    return await publishClaimed(row);
  } catch (e) {
    const results = { ...row.results, _error: { ok: false, error: errMsg(e) } };
    await db.update(socialPosts).set({ status: "failed", results }).where(and(eq(socialPosts.id, row.id), eq(socialPosts.tenantId, row.tenantId)));
    return { status: "failed", results };
  }
}

/** Loads the tenant's post, claims it, posts to each selected platform in parallel and records per-platform results. */
export async function publishPost(tenantId: string, postId: string) {
  const row = await claimPost(tenantId, postId);
  return row ? publishClaimedPost(row) : null;
}

/** Atomically claims every due scheduled post (all tenants) and publishes them. Safe to run concurrently. */
export async function publishDuePosts() {
  const claimed = await db
    .update(socialPosts)
    .set({ status: "posting" })
    .where(and(eq(socialPosts.status, "scheduled"), lte(socialPosts.scheduledAt, new Date())))
    .returning();
  const out = await Promise.all(claimed.map((r) => publishClaimedPost(r)));
  return { processed: claimed.length, posted: out.filter((o) => o.status === "posted").length };
}
