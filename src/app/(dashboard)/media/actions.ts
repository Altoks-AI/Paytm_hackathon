"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { mediaFiles } from "@/db/schema";
import { generateImage, generateVideo, getImageModelPrice, listGenerationModels, refreshPendingMedia, type GenModel, type GenResult, type MediaKind } from "@/lib/media/generate";
import { deleteFile } from "@/lib/media/storage";
import { appUrl, requireTenant } from "@/lib/tenant";

export async function getModels(kind: MediaKind): Promise<GenModel[]> {
  await requireTenant();
  return listGenerationModels(kind === "video" ? "video" : "image");
}

export async function getModelPrice(model: string): Promise<string | null> {
  await requireTenant();
  return getImageModelPrice(String(model));
}

export async function generateMedia(input: { kind: MediaKind; prompt: string; model: string; aspectRatio?: string; duration?: number; resolution?: string; useContext?: boolean }): Promise<GenResult> {
  const { tenantId } = await requireTenant();
  const common = { tenantId, prompt: String(input.prompt ?? ""), model: String(input.model ?? ""), aspectRatio: input.aspectRatio ? String(input.aspectRatio) : undefined, useContext: !!input.useContext };
  const res =
    input.kind === "video"
      ? await generateVideo({ ...common, duration: Number(input.duration) || undefined, resolution: input.resolution ? String(input.resolution) : undefined })
      : await generateImage(common);
  revalidatePath("/media");
  return res;
}

export async function deleteMedia(id: string) {
  const { tenantId } = await requireTenant();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const [row] = await db.delete(mediaFiles).where(and(eq(mediaFiles.id, id), eq(mediaFiles.tenantId, tenantId))).returning();
  if (row) {
    await deleteFile(row.tenantId, row.publicId, row.mime);
    // Videos that used this image as their thumbnail go back to having none.
    await db.update(mediaFiles).set({ thumbnailId: null }).where(and(eq(mediaFiles.tenantId, tenantId), eq(mediaFiles.thumbnailId, id)));
  }
  revalidatePath("/media");
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Sets (or clears, with null) a video's thumbnail to an image from the same tenant's library. */
export async function setThumbnail(videoId: string, imageId: string | null): Promise<{ ok: boolean; error?: string }> {
  const { tenantId } = await requireTenant();
  if (!UUID.test(videoId) || (imageId !== null && !UUID.test(imageId))) return { ok: false, error: "Invalid file" };
  if (imageId) {
    const [img] = await db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(and(eq(mediaFiles.id, imageId), eq(mediaFiles.tenantId, tenantId), eq(mediaFiles.kind, "image"), eq(mediaFiles.status, "ready")));
    if (!img) return { ok: false, error: "That image is not in your library" };
  }
  const rows = await db
    .update(mediaFiles)
    .set({ thumbnailId: imageId })
    .where(and(eq(mediaFiles.id, videoId), eq(mediaFiles.tenantId, tenantId), eq(mediaFiles.kind, "video")))
    .returning({ id: mediaFiles.id });
  revalidatePath("/media");
  return rows.length ? { ok: true } : { ok: false, error: "Video not found" };
}

/** Generates a 16:9 cover image with AI (safety check, credits and refund handled by generateImage) and sets it as the video's thumbnail. */
export async function generateThumbnail(videoId: string, prompt: string): Promise<{ ok: boolean; error?: string }> {
  const { tenantId } = await requireTenant();
  if (!UUID.test(videoId)) return { ok: false, error: "Invalid file" };
  const [video] = await db.select({ id: mediaFiles.id }).from(mediaFiles).where(and(eq(mediaFiles.id, videoId), eq(mediaFiles.tenantId, tenantId), eq(mediaFiles.kind, "video")));
  if (!video) return { ok: false, error: "Video not found" };
  const model = (await listGenerationModels("image"))[0];
  if (!model) return { ok: false, error: "No image model is available right now" };
  const res = await generateImage({
    tenantId,
    prompt: `Video thumbnail (cover image), clear single subject, readable at small size: ${String(prompt ?? "").trim()}`,
    model: model.id,
    aspectRatio: model.aspectRatios.includes("16:9") ? "16:9" : undefined,
    useContext: true,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return setThumbnail(videoId, res.id);
}

/** Polls the provider for pending videos; returns how many are still rendering. */
export async function refreshMedia(): Promise<number> {
  const { tenantId } = await requireTenant();
  return refreshPendingMedia(tenantId);
}

export type LibraryItem = { id: string; kind: "image" | "video"; url: string; thumbUrl: string | null; prompt: string | null; createdAt: string };

/** Ready files for the social composer's library picker. */
export async function listLibrary(kind?: MediaKind): Promise<LibraryItem[]> {
  const { tenantId } = await requireTenant();
  const where = [eq(mediaFiles.tenantId, tenantId), eq(mediaFiles.status, "ready")];
  if (kind === "image" || kind === "video") where.push(eq(mediaFiles.kind, kind));
  const rows = await db.select().from(mediaFiles).where(and(...where)).orderBy(desc(mediaFiles.createdAt)).limit(120);
  const thumbs = await thumbnailUrls(tenantId, rows);
  return rows.map((r) => ({ id: r.id, kind: r.kind, url: `${appUrl()}/api/media/${r.publicId}`, thumbUrl: thumbs.get(r.id) ?? null, prompt: r.prompt, createdAt: r.createdAt.toISOString() }));
}

/** Public thumbnail URL for each video in `rows` that has one, keyed by the video's id. */
async function thumbnailUrls(tenantId: string, rows: { id: string; thumbnailId: string | null }[]) {
  const ids = [...new Set(rows.map((r) => r.thumbnailId).filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const imgs = await db
    .select({ id: mediaFiles.id, publicId: mediaFiles.publicId })
    .from(mediaFiles)
    .where(and(eq(mediaFiles.tenantId, tenantId), inArray(mediaFiles.id, ids), eq(mediaFiles.status, "ready")));
  const byId = new Map(imgs.map((i) => [i.id, `${appUrl()}/api/media/${i.publicId}`]));
  for (const r of rows) if (r.thumbnailId && byId.has(r.thumbnailId)) out.set(r.id, byId.get(r.thumbnailId)!);
  return out;
}

/** Same lookup for server components (the media page). */
export async function getThumbnailUrls(rows: { id: string; thumbnailId: string | null }[]): Promise<Record<string, string>> {
  const { tenantId } = await requireTenant();
  return Object.fromEntries(await thumbnailUrls(tenantId, rows));
}
