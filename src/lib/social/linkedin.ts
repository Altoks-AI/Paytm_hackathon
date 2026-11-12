import type { ProviderConfig } from "@/lib/integrations";
import { checkInput, download, downloadImage, errMsg, readJson, sleep, tfetch, videoTitle, type PostInput, type PostResult } from "./util";

const API = "https://api.linkedin.com/rest";
const VERSION = process.env.LINKEDIN_VERSION || "202609";

type Creds = ProviderConfig["linkedin"];

const headers = (c: Creds, json = true): Record<string, string> => ({
  Authorization: `Bearer ${c.accessToken}`,
  "LinkedIn-Version": VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
  ...(json ? { "Content-Type": "application/json" } : {}),
});

/** LinkedIn "little text" format: escape reserved chars, keep #hashtags as hashtag templates. */
export function toLittleText(s: string) {
  const esc = (t: string) => t.replace(/[\\|{}@[\]()<>*_~]/g, (m) => `\\${m}`);
  return s
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part) => (/^#[\p{L}\p{N}_]+$/u.test(part) ? `{hashtag|\\#|${esc(part.slice(1))}}` : esc(part).replace(/#/g, "\\#")))
    .join("");
}

async function uploadImage(c: Creds, url: string): Promise<string> {
  const { bytes, contentType } = await download(url);
  const init = await readJson<{ value: { uploadUrl: string; image: string } }>(
    await tfetch(`${API}/images?action=initializeUpload`, { method: "POST", headers: headers(c), body: JSON.stringify({ initializeUploadRequest: { owner: c.authorUrn } }) }),
    "LinkedIn image init"
  );
  const put = await tfetch(init.value.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${c.accessToken}`, "Content-Type": contentType }, body: new Uint8Array(bytes) }, 120_000);
  if (!put.ok) throw new Error(`LinkedIn image upload ${put.status}: ${(await put.text()).slice(0, 200)}`);
  return init.value.image;
}

/** Videos API upload. With a thumbnail: uploadThumbnail=true, then PUT the image to thumbnailUploadUrl before finalizing.
 *  A thumbnail problem only adds a note (a feed video still serves without it). */
async function uploadVideo(c: Creds, url: string, thumbnailUrl?: string | null): Promise<{ video: string; note?: string }> {
  const { bytes } = await download(url);
  let note: string | undefined;
  let thumb: Buffer | undefined;
  if (thumbnailUrl) {
    try {
      thumb = (await downloadImage(thumbnailUrl, 20 * 1024 * 1024, ["image/jpeg", "image/png", "image/gif"])).bytes;
    } catch (e) {
      note = `Thumbnail not applied: ${errMsg(e)}`;
    }
  }
  const init = await readJson<{ value: { video: string; uploadToken?: string; thumbnailUploadUrl?: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } }>(
    await tfetch(`${API}/videos?action=initializeUpload`, {
      method: "POST",
      headers: headers(c),
      body: JSON.stringify({ initializeUploadRequest: { owner: c.authorUrn, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: !!thumb } }),
    }),
    "LinkedIn video init"
  );
  const { video, uploadToken = "", uploadInstructions, thumbnailUploadUrl } = init.value;
  const etags: string[] = [];
  for (const part of uploadInstructions) {
    const res = await tfetch(part.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(bytes.subarray(part.firstByte, part.lastByte + 1)) }, 180_000);
    if (!res.ok) throw new Error(`LinkedIn video part upload ${res.status}`);
    const etag = res.headers.get("etag");
    if (!etag) throw new Error("LinkedIn video part upload returned no ETag");
    etags.push(etag);
  }
  if (thumb) {
    try {
      if (!thumbnailUploadUrl) throw new Error("LinkedIn returned no thumbnail upload URL");
      const res = await tfetch(thumbnailUploadUrl, { method: "PUT", headers: { "media-type-family": "STILLIMAGE", "Content-Type": "application/octet-stream" }, body: new Uint8Array(thumb) }, 120_000);
      if (!res.ok) throw new Error(`LinkedIn thumbnail upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      note = `Thumbnail not applied: ${errMsg(e)}`;
    }
  }
  await readJson(
    await tfetch(`${API}/videos?action=finalizeUpload`, {
      method: "POST",
      headers: headers(c),
      body: JSON.stringify({ finalizeUploadRequest: { video, uploadToken, uploadedPartIds: etags } }),
    }),
    "LinkedIn video finalize"
  );
  // Wait for processing (up to ~3 min).
  for (let i = 0; i < 36; i++) {
    const v = await readJson<{ status?: string; processingFailureReason?: string }>(
      await tfetch(`${API}/videos/${encodeURIComponent(video)}`, { headers: headers(c, false) }),
      "LinkedIn video status"
    );
    if (v.status === "AVAILABLE") return { video, note };
    if (v.status === "PROCESSING_FAILED") throw new Error(`LinkedIn video processing failed: ${v.processingFailureReason || "unknown reason"}`);
    await sleep(5000);
  }
  throw new Error("LinkedIn video is still processing — try again later");
}

export async function post(c: Creds, input: PostInput): Promise<PostResult> {
  try {
    const bad = checkInput("linkedin", input);
    if (bad) return { ok: false, error: bad };
    if (!c.accessToken || !c.authorUrn) return { ok: false, error: "LinkedIn credentials incomplete (accessToken, authorUrn)" };
    let mediaId: string | undefined;
    let note: string | undefined;
    if (input.mediaType === "image") mediaId = await uploadImage(c, input.mediaUrl!);
    if (input.mediaType === "video") ({ video: mediaId, note } = await uploadVideo(c, input.mediaUrl!, input.thumbnailUrl));
    const title = input.mediaType === "video" ? videoTitle(input, 200) : undefined;
    const res = await tfetch(`${API}/posts`, {
      method: "POST",
      headers: headers(c),
      body: JSON.stringify({
        author: c.authorUrn,
        commentary: toLittleText(input.content),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        ...(mediaId ? { content: { media: { id: mediaId, ...(title && { title }) } } } : {}),
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    await readJson(res, "LinkedIn post");
    return { ok: true, id: res.headers.get("x-restli-id") || undefined, ...(note && { note }) };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
