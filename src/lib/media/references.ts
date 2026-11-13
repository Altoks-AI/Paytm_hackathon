// Reference attachments (screenshots / clips) for AI generation. Client-safe: no server imports.
import type { GenModel, MediaKind } from "./generate";

export const MAX_REFERENCES = 3;
export const REFERENCE_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];
export const REFERENCE_VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_REFERENCE_VIDEO_BYTES = 200 * 1024 * 1024;
export const REFERENCE_INSTRUCTION = "Use the attached reference exactly as-is for logo, branding, layout and UI. Do not invent or alter any logos, text or interface elements.";
export const NO_REFERENCE_SUPPORT = "This model doesn't support reference images.";

export const MODEL_NEEDS_REFERENCE = "This model needs a reference image. Attach one with +";

export type ReferenceSupport = { images: boolean; video: boolean };

// Per-model capability, from OpenRouter's live model lists (verified): image models expose
// supported_parameters.input_references {min,max} on GET /images/models; video models expose
// supported_frame_images (first_frame / last_frame) on GET /videos/models. No video-file references exist
// in the API, so video attachments are never supported. The family regex is only a fallback for when the
// model list is unreachable (static fallback list).
const IMAGE_REF_FALLBACK = /gemini|gpt-image|seedream|flux\.2/i;
const VIDEO_REF_FALLBACK = /veo|kling|seedance|wan/i;

export function referenceSupport(m: Pick<GenModel, "id" | "kind" | "frameImages" | "maxImageRefs"> | undefined | null): ReferenceSupport {
  if (!m) return { images: false, video: false };
  if (m.kind === "image") return { images: m.maxImageRefs !== undefined ? m.maxImageRefs > 0 : IMAGE_REF_FALLBACK.test(m.id), video: false };
  return { images: m.frameImages ? m.frameImages.length > 0 : VIDEO_REF_FALLBACK.test(m.id), video: false };
}

/** Validates a picked file (type + size) for the given generation kind. Returns an error message or null. */
export function validateReferenceFile(file: { name: string; type: string; size: number }, support: ReferenceSupport, kind: MediaKind): string | null {
  const isImg = REFERENCE_IMAGE_MIMES.includes(file.type);
  const isVid = kind === "video" && REFERENCE_VIDEO_MIMES.includes(file.type);
  if (!isImg && !isVid) return `${file.name}: only ${kind === "video" ? "PNG, JPEG, WebP, MP4, WebM or MOV" : "PNG, JPEG or WebP"} files are allowed`;
  if (isVid && !support.video) return `${file.name}: this model accepts image references only`;
  if (isImg && file.size > MAX_REFERENCE_IMAGE_BYTES) return `${file.name}: images must be 20 MB or smaller`;
  if (isVid && file.size > MAX_REFERENCE_VIDEO_BYTES) return `${file.name}: videos must be 200 MB or smaller`;
  return null;
}

// Edit-only models (live list: supported_parameters.input_references.min >= 1, e.g. krea/k3-edit, recraft-v4-styles*)
// cannot run without a reference. Fallback regex is used only when the live list is unavailable.
const REQUIRES_REF_FALLBACK = /k3-edit|recraft-v4-styles/i;

export function requiresReference(m: Pick<GenModel, "id" | "kind" | "minImageRefs"> | undefined | null): boolean {
  if (!m || m.kind !== "image") return false;
  return m.minImageRefs !== undefined ? m.minImageRefs >= 1 : REQUIRES_REF_FALLBACK.test(m.id);
}
