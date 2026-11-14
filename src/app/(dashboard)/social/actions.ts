"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { socialPosts } from "@/db/schema";
import { claimPost, publishClaimedPost } from "@/lib/social";
import { isPlatform, PLATFORM_LABEL, PLATFORM_MAX, PLATFORM_MEDIA, type MediaType, type Platform } from "@/lib/social/platforms";
import { requireTenant } from "@/lib/tenant";
import { complete } from "@/lib/llm";
import { checkGenerationRequest } from "@/lib/guardrails";
import { addCredits, chargeCredits, CREDIT_COSTS, OUT_OF_CREDITS } from "@/lib/credits";

export type FormState = { error?: string } | undefined;

/** AI-writes the post text: the full post for text posts, or the description that goes with an image/video. */
export async function generatePostText(input: { topic: string; platforms: string[]; mediaType: string }): Promise<{ text?: string; title?: string; error?: string }> {
  const { tenant, tenantId } = await requireTenant();
  const topic = input.topic.trim().slice(0, 1000);
  if (!topic) return { error: "Say what the post is about" };
  const safe = await checkGenerationRequest(topic, "post_text");
  if (!safe.ok) return { error: safe.reason };
  if (!(await chargeCredits(tenantId, "ai_post_text"))) return { error: OUT_OF_CREDITS };

  const ps = input.platforms.filter(isPlatform);
  const max = ps.length ? Math.min(...ps.map((p) => PLATFORM_MAX[p])) : 3000;
  const lengthHint = max <= 280 ? "Keep it under 260 characters (it must fit in a tweet)." : max <= 2200 ? "Keep it under 1200 characters." : "Aim for 80-200 words.";
  const kind = input.mediaType === "text" ? "a text-only post" : `the description that accompanies ${input.mediaType === "video" ? "a video" : "an image"} post (do not describe the media frame by frame; write the message that goes with it)`;
  const wantsTitle = input.mediaType === "video";
  const system = [
    `You write official social media posts for the company "${tenant.name}".`,
    tenant.companySummary ? `About the company:\n${tenant.companySummary}` : "",
    tenant.industry ? `Industry: ${tenant.industry}.` : "",
    tenant.website ? `Website: ${tenant.website}.` : "",
    "Tone: professional, clear and credible — the way a reputable company speaks on LinkedIn. Open with a strong first line, short paragraphs, a clear call to action, and 3-5 relevant hashtags at the end. Minimal or no emojis.",
    "Only state facts found in the company details or the topic; never invent statistics, prices, awards, customer names or guarantees. Nothing offensive, political, misleading or disparaging of competitors.",
    wantsTitle
      ? "Return exactly this format and nothing else:\nTITLE: <the video title on one line>\nDESCRIPTION:\n<the post text described above>\nThe title is at most 90 characters, specific and factual, no clickbait, no emojis, no hashtags, no ALL CAPS. No markdown formatting anywhere."
      : "Return ONLY the post text — no preamble, no quotes, no markdown formatting.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const user = `Write ${kind}.\nTopic: ${topic}\nTarget platforms: ${ps.map((p) => PLATFORM_LABEL[p]).join(", ") || "general"}\n${lengthHint}`;
  try {
    const raw = (await complete(system, user, { maxTokens: 800 })).trim();
    let text = raw;
    let title: string | undefined;
    if (wantsTitle) {
      // Models don't reliably follow one format, so accept labelled text, JSON (even with raw newlines), then fall back.
      const clean = (v: string) => v.replace(/\x5cn/g, "\n").replace(/\x5c"/g, '"').replace(/^[\s"'*#]+|[\s"'*,]+$/g, "");
      const body = raw.replace(/^```(?:json)?\s*|\s*```$/g, "");
      const labelled = body.match(/^[\s*#]*title[\s*]*[:\-][\s*]*(.+?)\s*\n+[\s*#]*description[\s*]*[:\-]?[\s*]*([\s\S]+)$/i);
      const jsonTitle = body.match(/"title"\s*:\s*"((?:[^"\x5c]|\x5c.)*)"/i);
      const jsonDesc = body.match(/"description"\s*:\s*"([\s\S]*?)"\s*,?\s*(?:"title"\s*:[\s\S]*)?\}?\s*$/i) ?? body.match(/"description"\s*:\s*"([\s\S]*)$/i);
      if (labelled) {
        title = clean(labelled[1]);
        text = labelled[2].trim();
      } else if (jsonTitle || jsonDesc) {
        if (jsonTitle) title = clean(jsonTitle[1]);
        if (jsonDesc && clean(jsonDesc[1])) text = clean(jsonDesc[1]);
      }
      // Never leave the title empty: use the description's first line, without hashtags.
      if (!title) title = (text.split(/\n|(?<=[.!?])\s/)[0] ?? "").replace(/#\S+/g, "").trim();
      title = [...title].slice(0, 100).join("").trim() || undefined;
    }
    text = text.replace(/^["']|["']$/g, "").trim();
    if ([...text].length > max) text = [...text].slice(0, max).join("");
    if (!text) throw new Error("The AI returned an empty response");
    return { text, title };
  } catch (e) {
    await addCredits(tenantId, CREDIT_COSTS.ai_post_text.cost, "refund", "Post text generation failed");
    return { error: e instanceof Error ? e.message : "Generation failed" };
  }
}

export async function savePost(_prev: FormState, fd: FormData): Promise<FormState> {
  const { tenantId } = await requireTenant();
  const id = String(fd.get("id") || "") || null;
  const intent = String(fd.get("intent") || "draft") as "post" | "schedule" | "draft";
  const content = String(fd.get("content") || "").trim();
  const mediaType = (["text", "image", "video"].includes(String(fd.get("mediaType"))) ? String(fd.get("mediaType")) : "text") as MediaType;
  const mediaUrl = mediaType === "text" ? null : String(fd.get("mediaUrl") || "").trim() || null;
  const platforms = fd.getAll("platforms").map(String).filter(isPlatform) as Platform[];

  if (!content && mediaType === "text") return { error: "Write some content first" };
  if (mediaUrl && !/^https?:\/\//i.test(mediaUrl)) return { error: "Media URL must be a public http(s) URL" };
  if (mediaType !== "text" && !mediaUrl) return { error: `Add ${mediaType === "image" ? "an image" : "a video"} first: upload one, generate one, or choose from your library` };
  const title = mediaType === "video" ? [...String(fd.get("title") || "").trim()].slice(0, 100).join("") || null : null;
  const rawThumb = mediaType === "video" ? String(fd.get("thumbnailUrl") || "").trim() : "";
  if (rawThumb && !/^https?:\/\//i.test(rawThumb)) return { error: "Thumbnail must be a public http(s) URL" };
  const thumbnailUrl = rawThumb || null;

  let scheduledAt: Date | null = null;
  if (intent !== "draft") {
    if (!platforms.length) return { error: "Select at least one platform" };
    if (platforms.includes("youtube") && !title) return { error: "Add a title to post this video to YouTube" };
    for (const p of platforms) {
      if (!PLATFORM_MEDIA[p].includes(mediaType)) return { error: `${PLATFORM_LABEL[p]} does not support ${mediaType} posts` };
      if ([...content].length > PLATFORM_MAX[p]) return { error: `${PLATFORM_LABEL[p]} allows at most ${PLATFORM_MAX[p]} characters` };
    }
  }
  if (intent === "schedule") {
    const raw = String(fd.get("scheduledAt") || "");
    scheduledAt = raw ? new Date(raw) : null;
    if (!scheduledAt || isNaN(scheduledAt.getTime())) return { error: "Pick a schedule date/time" };
    if (scheduledAt.getTime() < Date.now() - 60_000) return { error: "Schedule time is in the past" };
  }

  const values = {
    title,
    thumbnailUrl,
    content,
    mediaType,
    mediaUrl,
    platforms,
    scheduledAt,
    status: intent === "schedule" ? "scheduled" : "draft",
    results: {},
  };

  let postId = id;
  if (id) {
    const [row] = await db
      .update(socialPosts)
      .set(values)
      .where(and(eq(socialPosts.id, id), eq(socialPosts.tenantId, tenantId), inArray(socialPosts.status, ["draft", "scheduled"])))
      .returning({ id: socialPosts.id });
    if (!row) return { error: "Only drafts and scheduled posts can be edited" };
  } else {
    const [row] = await db.insert(socialPosts).values({ ...values, tenantId }).returning({ id: socialPosts.id });
    postId = row.id;
  }

  if (intent === "post" && postId) {
    const row = await claimPost(tenantId, postId);
    if (row) after(() => publishClaimedPost(row));
  }
  revalidatePath("/social");
  redirect("/social");
}

export async function retryPost(id: string) {
  const { tenantId } = await requireTenant();
  const [failed] = await db
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(and(eq(socialPosts.id, id), eq(socialPosts.tenantId, tenantId), eq(socialPosts.status, "failed")));
  const row = failed ? await claimPost(tenantId, id) : null;
  if (row) after(() => publishClaimedPost(row));
  revalidatePath("/social");
}

export async function deletePost(id: string) {
  const { tenantId } = await requireTenant();
  await db.delete(socialPosts).where(and(eq(socialPosts.id, id), eq(socialPosts.tenantId, tenantId)));
  revalidatePath("/social");
}
