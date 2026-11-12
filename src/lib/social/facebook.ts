import type { ProviderConfig } from "@/lib/integrations";
import { META_GRAPH_VERSION } from "@/lib/wa-templates";
import { checkInput, downloadImage, errMsg, readJson, tfetch, videoTitle, type PostInput, type PostResult } from "./util";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || META_GRAPH_VERSION;

type Creds = ProviderConfig["facebook"];

export async function post(c: Creds, input: PostInput): Promise<PostResult> {
  try {
    const bad = checkInput("facebook", input);
    if (bad) return { ok: false, error: bad };
    if (!c.pageId || !c.pageAccessToken) return { ok: false, error: "Facebook credentials incomplete (pageId, pageAccessToken)" };
    const params = new URLSearchParams({ access_token: c.pageAccessToken });
    let edge = "feed";
    if (input.mediaType === "text") params.set("message", input.content);
    else if (input.mediaType === "image") {
      edge = "photos";
      params.set("url", input.mediaUrl!);
      if (input.content) params.set("caption", input.content);
    } else {
      edge = "videos";
      params.set("file_url", input.mediaUrl!);
      if (input.content) params.set("description", input.content);
      const title = videoTitle(input, 255);
      if (title) params.set("title", title);
    }
    const host = edge === "videos" ? "https://graph-video.facebook.com" : "https://graph.facebook.com";
    const res = await readJson<{ id?: string; post_id?: string }>(
      await tfetch(`${host}/${GRAPH_VERSION}/${encodeURIComponent(c.pageId)}/${edge}`, { method: "POST", body: params }, edge === "videos" ? 180_000 : 60_000),
      "Facebook"
    );
    const note = edge === "videos" && input.thumbnailUrl ? (res.id ? await setThumbnail(c, res.id, input.thumbnailUrl) : "Thumbnail not applied: Facebook returned no video id") : undefined;
    return { ok: true, id: res.post_id || res.id, ...(note && { note }) };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** POST /{video-id}/thumbnails with source (image file, max 10 MB) + is_preferred. Returns a note on failure; the video is already posted. */
async function setThumbnail(c: Creds, videoId: string, url: string): Promise<string | undefined> {
  try {
    const { bytes, contentType } = await downloadImage(url, 10 * 1024 * 1024, ["image/jpeg", "image/png"]);
    const form = new FormData();
    form.append("access_token", c.pageAccessToken);
    form.append("is_preferred", "true");
    form.append("source", new Blob([new Uint8Array(bytes)], { type: contentType }), contentType === "image/png" ? "thumbnail.png" : "thumbnail.jpg");
    await readJson(await tfetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(videoId)}/thumbnails`, { method: "POST", body: form }, 60_000), "Facebook thumbnail");
    return undefined;
  } catch (e) {
    return `Thumbnail not applied: ${errMsg(e)}`;
  }
}
