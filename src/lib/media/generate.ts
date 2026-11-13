// AI image + video generation through OpenRouter's dedicated media APIs:
//   images: POST /api/v1/images  -> { data: [{ b64_json, media_type }] }            (models: GET /api/v1/images/models)
//   videos: POST /api/v1/videos  -> 202 { id, polling_url, status }                 (models: GET /api/v1/videos/models)
//           GET  /api/v1/videos/{id} -> { status: pending|in_progress|completed|failed|cancelled|expired, error? }
//           GET  /api/v1/videos/{id}/content -> video bytes (Bearer auth)
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaFiles } from "@/db/schema";
import { addCredits, chargeCredits, CREDIT_COSTS, OUT_OF_CREDITS } from "@/lib/credits";
import { checkGenerationRequest, VISUAL_STYLE_GUARD } from "@/lib/guardrails";
import { getTenant } from "@/lib/tenant-data";
import { MODEL_NEEDS_REFERENCE, REFERENCE_INSTRUCTION, referenceSupport, requiresReference } from "./references";
import { deleteFile, isMediaMime, MAX_VIDEO_BYTES, newPublicId, readBuffer, saveBuffer, saveStream, sniffMime, type MediaMime } from "./storage";

const API = "https://openrouter.ai/api/v1";
const headers = () => ({ Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" });

export type MediaKind = "image" | "video";
export type GenModel = { id: string; name: string; kind: MediaKind; aspectRatios: string[]; durations?: number[]; resolutions?: string[]; price?: string; frameImages?: string[]; maxImageRefs?: number; minImageRefs?: number };
export type GenResult = { ok: true; id: string } | { ok: false; error: string };

const IMAGE_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "4:5"];
const FALLBACK: GenModel[] = [
  ...["google/gemini-2.5-flash-image", "openai/gpt-image-1", "bytedance-seed/seedream-4.5", "black-forest-labs/flux.2-pro"].map((id) => ({ id, name: id, kind: "image" as const, aspectRatios: IMAGE_RATIOS })),
  ...["google/veo-3.1-fast", "kwaivgi/kling-v3.0-std", "bytedance/seedance-2.0-fast", "minimax/hailuo-2.3"].map((id) => ({ id, name: id, kind: "video" as const, aspectRatios: ["16:9", "9:16"], durations: [5, 6, 8, 10] })),
];

/** Short human price from a video model's pricing_skus (formats vary per provider: USD/s, cents/s, per video token). */
function videoPrice(skus: Record<string, string> | undefined) {
  const entries = Object.entries(skus ?? {}).sort((a, b) => a[0].length - b[0].length);
  for (const [k, v] of entries) {
    const n = Number(v);
    if (!isFinite(n)) continue;
    if (/cents_per_(second_output|video_output_second)/.test(k)) return `$${(n / 100).toFixed(3)}/s`;
    if (/^(duration_seconds|text_to_video_duration_seconds)/.test(k)) return `$${n.toFixed(3)}/s`;
  }
  const tok = entries.find(([k]) => k === "video_tokens");
  return tok ? `$${(Number(tok[1]) * 1e6).toFixed(2)}/M video tokens` : undefined;
}

let cache: { at: number; models: GenModel[] } | null = null;

/** Image + video generation models from OpenRouter (cached 1h, small fallback list if the API is unreachable). */
export async function listGenerationModels(kind?: MediaKind): Promise<GenModel[]> {
  if (!cache || Date.now() - cache.at > 3600_000) {
    try {
      const get = async (p: string) => {
        const r = await fetch(`${API}${p}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
        if (!r.ok) throw new Error(`OpenRouter ${p} ${r.status}`);
        return ((await r.json()).data ?? []) as Record<string, unknown>[];
      };
      const [img, vid] = await Promise.all([get("/images/models"), get("/videos/models")]);
      const models: GenModel[] = [
        ...img.map((m) => {
          const ar = (m.supported_parameters as { aspect_ratio?: { values?: string[] } } | undefined)?.aspect_ratio?.values?.filter((x) => x !== "auto");
          const ir = (m.supported_parameters as { input_references?: { min?: number; max?: number } } | undefined)?.input_references;
          return { id: String(m.id), name: String(m.name || m.id), kind: "image" as const, aspectRatios: ar?.length ? ar : IMAGE_RATIOS, maxImageRefs: typeof ir?.max === "number" ? ir.max : 0, minImageRefs: typeof ir?.min === "number" ? ir.min : 0 };
        }),
        ...vid
          .filter((m) => Array.isArray(m.supported_durations) && (m.supported_durations as number[]).length) // excludes edit/upscale-only models
          .map((m) => ({
            id: String(m.id),
            name: String(m.name || m.id),
            kind: "video" as const,
            aspectRatios: (m.supported_aspect_ratios as string[] | null) ?? ["16:9"],
            durations: [...(m.supported_durations as number[])].sort((a, b) => a - b),
            resolutions: (m.supported_resolutions as string[] | null) ?? [],
            price: videoPrice(m.pricing_skus as Record<string, string>),
            frameImages: Array.isArray(m.supported_frame_images) ? (m.supported_frame_images as string[]) : undefined,
          })),
      ];
      if (!models.length) throw new Error("empty model list");
      cache = { at: Date.now(), models };
    } catch (e) {
      console.error("[media] model list failed", e instanceof Error ? e.message : e);
      cache = { at: Date.now() - 3300_000, models: FALLBACK }; // retry in ~5 min
    }
  }
  return kind ? cache.models.filter((m) => m.kind === kind) : cache.models;
}

const priceCache = new Map<string, { at: number; price: string | null }>();

/** Image price lives on the per-model endpoints record: pricing[] lines of { billable, unit, cost_usd }. */
export async function getImageModelPrice(model: string): Promise<string | null> {
  if (!/^[\w.-]+\/[\w.:-]+$/.test(model)) return null;
  const hit = priceCache.get(model);
  if (hit && Date.now() - hit.at < 3600_000) return hit.price;
  let price: string | null = null;
  try {
    const r = await fetch(`${API}/images/models/${model}/endpoints`, { headers: headers(), signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      const ep = ((await r.json()).endpoints ?? [])[0] as { pricing?: { billable: string; unit: string; cost_usd: number }[] } | undefined;
      const line = ep?.pricing?.find((p) => p.billable.startsWith("output")) ?? ep?.pricing?.[0];
      if (line) price = line.unit === "token" ? `$${(line.cost_usd * 1e6).toFixed(2)}/M tokens` : `$${line.cost_usd}/${line.unit}`;
    }
  } catch {}
  priceCache.set(model, { at: Date.now(), price });
  return price;
}

async function resolveModel(kind: MediaKind, model: string) {
  const list = await listGenerationModels(kind);
  return list.find((m) => m.id === model) ?? null;
}

/** Final provider prompt: user prompt + optional brand context + the always-on professional/brand-safe style guard. */
async function withContext(tenantId: string, prompt: string, useContext?: boolean, hasReference?: boolean) {
  let out = prompt;
  if (hasReference) out += `

${REFERENCE_INSTRUCTION}`; // server-side only, so the prompt shown in the UI stays clean
  if (useContext) {
    const t = await getTenant(tenantId);
    const about = [t?.name && `Brand: ${t.name}.`, t?.industry && `Industry: ${t.industry}.`, t?.companySummary?.slice(0, 600)].filter(Boolean).join(" ");
    if (about) out += `\n\nBrand context (match this brand's style and audience; do not render this text): ${about}`;
  }
  return `${out}\n\n${VISUAL_STYLE_GUARD}`;
}

/** A stored library image attached as a generation reference. */
export type ReferenceFile = { tenantId: string; publicId: string; mime: string };

/** data: URL for each reference (works even when the app URL is not publicly reachable by the provider). */
async function referenceUrls(refs: ReferenceFile[]) {
  return Promise.all(refs.map(async (r) => `data:${r.mime};base64,${(await readBuffer(r.tenantId, r.publicId, r.mime)).toString("base64")}`));
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

async function providerError(r: Response) {
  const text = await r.text();
  try {
    const j = JSON.parse(text);
    return `OpenRouter ${r.status}: ${j.error?.message || j.message || text}`.slice(0, 500);
  } catch {
    return `OpenRouter ${r.status}: ${text}`.slice(0, 500);
  }
}

export async function generateImage(input: { tenantId: string; prompt: string; model: string; aspectRatio?: string; useContext?: boolean; references?: ReferenceFile[] }): Promise<GenResult> {
  const { tenantId } = input;
  const prompt = input.prompt.trim().slice(0, 4000);
  if (!prompt) return { ok: false, error: "Enter a prompt" };
  const m = await resolveModel("image", input.model);
  if (!m) return { ok: false, error: "Unknown image model" };
  const refs = input.references ?? [];
  if (requiresReference(m) && !refs.length) return { ok: false, error: MODEL_NEEDS_REFERENCE };
  if (refs.length && !referenceSupport(m).images) return { ok: false, error: "This model doesn't support reference images." };
  if (m.maxImageRefs && refs.length > m.maxImageRefs) return { ok: false, error: `This model accepts at most ${m.maxImageRefs} reference image${m.maxImageRefs === 1 ? "" : "s"}.` };
  const aspectRatio = input.aspectRatio && m.aspectRatios.includes(input.aspectRatio) ? input.aspectRatio : undefined;
  const safe = await checkGenerationRequest(prompt, "image");
  if (!safe.ok) return { ok: false, error: safe.reason };
  if (!(await chargeCredits(tenantId, "image_generation", { note: m.id }))) return { ok: false, error: OUT_OF_CREDITS };
  try {
    // Reference images: "input_references" (array of http(s)/data URLs) on POST /images, per openrouter.ai/docs/api/api-reference/images/generate-an-image.
    const refUrls = refs.length ? await referenceUrls(refs) : [];
    const r = await fetch(`${API}/images`, {
      method: "POST",
      headers: headers(),
      signal: AbortSignal.timeout(300_000),
      body: JSON.stringify({ model: m.id, prompt: await withContext(tenantId, prompt, input.useContext, !!refs.length), n: 1, ...(aspectRatio && { aspect_ratio: aspectRatio }), ...(refUrls.length && { input_references: refUrls }) }),
    });
    if (!r.ok) throw new Error(await providerError(r));
    const img = ((await r.json()).data ?? [])[0] as { b64_json?: string; media_type?: string } | undefined;
    if (!img?.b64_json) throw new Error("The model returned no image");
    const bytes = Buffer.from(img.b64_json, "base64");
    const mime: MediaMime | null = img.media_type && isMediaMime(img.media_type) ? img.media_type : sniffMime(bytes);
    if (!mime || !mime.startsWith("image/")) throw new Error(`Unsupported image format${img.media_type ? ` (${img.media_type})` : ""}`);
    const publicId = newPublicId();
    const sizeBytes = await saveBuffer(tenantId, publicId, mime, bytes);
    const [row] = await db
      .insert(mediaFiles)
      .values({ tenantId, publicId, kind: "image", mime, sizeBytes, source: "generated", prompt, model: m.id, status: "ready" })
      .returning({ id: mediaFiles.id });
    return { ok: true, id: row.id };
  } catch (e) {
    await addCredits(tenantId, CREDIT_COSTS.image_generation.cost, "refund", `Image generation failed (${m.id})`);
    return { ok: false, error: errMsg(e) };
  }
}

export async function generateVideo(input: {
  tenantId: string;
  prompt: string;
  model: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  useContext?: boolean;
  references?: ReferenceFile[];
}): Promise<GenResult> {
  const { tenantId } = input;
  const prompt = input.prompt.trim().slice(0, 4000);
  if (!prompt) return { ok: false, error: "Enter a prompt" };
  const m = await resolveModel("video", input.model);
  if (!m) return { ok: false, error: "Unknown video model" };
  const refs = input.references ?? [];
  if (requiresReference(m) && !refs.length) return { ok: false, error: MODEL_NEEDS_REFERENCE };
  if (refs.length && !referenceSupport(m).images) return { ok: false, error: "This model doesn't support reference images." };
  const frames = (["first_frame", "last_frame"] as const).filter((f) => (m.frameImages ?? ["first_frame"]).includes(f));
  if (refs.length > frames.length) return { ok: false, error: `This model accepts at most ${frames.length} reference image${frames.length === 1 ? "" : "s"} (used as ${frames.join(" / ").replace(/_/g, " ")}).` };
  const body: Record<string, unknown> = { model: m.id, prompt: await withContext(tenantId, prompt, input.useContext, !!refs.length) };
  if (input.aspectRatio && m.aspectRatios.includes(input.aspectRatio)) body.aspect_ratio = input.aspectRatio;
  if (input.duration && m.durations?.includes(input.duration)) body.duration = input.duration;
  if (input.resolution && m.resolutions?.includes(input.resolution)) body.resolution = input.resolution;
  const safe = await checkGenerationRequest(prompt, "video");
  if (!safe.ok) return { ok: false, error: safe.reason };
  if (!(await chargeCredits(tenantId, "video_generation", { note: m.id }))) return { ok: false, error: OUT_OF_CREDITS };
  try {
    if (refs.length) {
      // Per openrouter.ai/docs/features/multimodal/video-generation: frame_images entries carry frame_type first_frame|last_frame.
      // (input_references is style guidance only and is ignored when frame_images is present, so we use frame_images alone.)
      const urls = await referenceUrls(refs);
      body.frame_images = urls.map((url, i) => ({ type: "image_url", image_url: { url }, frame_type: frames[i] }));
    }
    const r = await fetch(`${API}/videos`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(await providerError(r));
    const job = (await r.json()) as { id?: string; status?: string };
    if (!job.id) throw new Error("OpenRouter returned no job id");
    const [row] = await db
      .insert(mediaFiles)
      .values({ tenantId, publicId: newPublicId(), kind: "video", mime: "video/mp4", source: "generated", prompt, model: m.id, status: "pending", jobId: job.id })
      .returning({ id: mediaFiles.id });
    return { ok: true, id: row.id };
  } catch (e) {
    await addCredits(tenantId, CREDIT_COSTS.video_generation.cost, "refund", `Video generation failed (${m.id})`);
    return { ok: false, error: errMsg(e) };
  }
}

const inFlight = new Set<string>();

/** Mark a pending video failed (once) and refund it. */
async function failVideo(row: { id: string; tenantId: string; model: string | null }, error: string) {
  const [done] = await db
    .update(mediaFiles)
    .set({ status: "failed", error: error.slice(0, 500) })
    .where(and(eq(mediaFiles.id, row.id), eq(mediaFiles.status, "pending")))
    .returning({ id: mediaFiles.id });
  if (done) await addCredits(row.tenantId, CREDIT_COSTS.video_generation.cost, "refund", `Video generation failed (${row.model ?? "unknown"})`);
}

/** Poll OpenRouter for this tenant's pending videos; download finished ones to storage. Returns how many are still pending. */
export async function refreshPendingMedia(tenantId: string): Promise<number> {
  const rows = await db
    .select()
    .from(mediaFiles)
    .where(and(eq(mediaFiles.tenantId, tenantId), eq(mediaFiles.status, "pending")))
    .limit(20);
  await Promise.all(
    rows.map(async (row) => {
      if (inFlight.has(row.id)) return;
      inFlight.add(row.id);
      try {
        if (!row.jobId) return failVideo(row, "Missing provider job id");
        const r = await fetch(`${API}/videos/${encodeURIComponent(row.jobId)}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
        if (r.status === 404) return failVideo(row, "Generation job not found");
        if (!r.ok) return; // transient — try again next poll
        const job = (await r.json()) as { status?: string; error?: string | { message?: string } };
        if (job.status === "failed" || job.status === "cancelled" || job.status === "expired") {
          const err = typeof job.error === "string" ? job.error : job.error?.message;
          return failVideo(row, err || `Generation ${job.status}`);
        }
        if (job.status !== "completed") return Date.now() - row.createdAt.getTime() > 6 * 3600_000 ? failVideo(row, "Generation timed out") : undefined;
        const c = await fetch(`${API}/videos/${encodeURIComponent(row.jobId)}/content?index=0`, { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }, signal: AbortSignal.timeout(300_000) });
        if (!c.ok || !c.body) return failVideo(row, await providerError(c));
        const ct = (c.headers.get("content-type") || "").split(";")[0].trim();
        const mime: MediaMime = isMediaMime(ct) && ct.startsWith("video/") ? ct : "video/mp4";
        const sizeBytes = await saveStream(tenantId, row.publicId, mime, c.body, MAX_VIDEO_BYTES);
        const [ok] = await db
          .update(mediaFiles)
          .set({ status: "ready", mime, sizeBytes, error: null })
          .where(and(eq(mediaFiles.id, row.id), eq(mediaFiles.status, "pending")))
          .returning({ id: mediaFiles.id });
        if (!ok) await deleteFile(tenantId, row.publicId, mime); // deleted/failed meanwhile
      } catch (e) {
        console.error("[media] refresh failed", row.id, errMsg(e));
        if (Date.now() - row.createdAt.getTime() > 6 * 3600_000) await failVideo(row, errMsg(e));
      } finally {
        inFlight.delete(row.id);
      }
    }),
  );
  const still = await db
    .select({ id: mediaFiles.id })
    .from(mediaFiles)
    .where(and(eq(mediaFiles.tenantId, tenantId), eq(mediaFiles.status, "pending")));
  return still.length;
}
