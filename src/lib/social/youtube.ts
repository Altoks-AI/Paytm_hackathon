import type { ProviderConfig } from "@/lib/integrations";
import { checkInput, download, downloadImage, errMsg, readJson, tfetch, type PostInput, type PostResult } from "./util";

type Creds = ProviderConfig["youtube"];

async function accessToken(c: Creds) {
  const res = await tfetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: "refresh_token" }),
  });
  const data = await readJson<{ access_token: string }>(res, "YouTube token refresh");
  return data.access_token;
}

export async function post(c: Creds, input: PostInput): Promise<PostResult> {
  try {
    if (input.mediaType !== "video") return { ok: false, error: "YouTube only supports video posts — attach a video" };
    const bad = checkInput("youtube", input);
    if (bad) return { ok: false, error: bad };
    if (!c.clientId || !c.clientSecret || !c.refreshToken) return { ok: false, error: "YouTube credentials incomplete (clientId, clientSecret, refreshToken)" };

    const token = await accessToken(c);
    const firstLine = input.content.split("\n").find((l) => l.trim())?.trim() || "New video";
    const title = [...(input.title?.trim() || firstLine).replace(/[<>]/g, "")].slice(0, 100).join("").trim() || "New video";
    const { bytes, contentType } = await download(input.mediaUrl!);
    const videoType = contentType.startsWith("video/") ? contentType : "application/octet-stream";

    const init = await tfetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(bytes.length),
        "X-Upload-Content-Type": videoType,
      },
      body: JSON.stringify({
        snippet: { title, description: input.content.replace(/[<>]/g, "") },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      }),
    });
    if (!init.ok) await readJson(init, "YouTube upload init");
    const location = init.headers.get("location");
    if (!location) throw new Error("YouTube did not return an upload URL");

    const up = await tfetch(location, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": videoType, "Content-Length": String(bytes.length) }, body: new Uint8Array(bytes) }, 600_000);
    const video = await readJson<{ id: string }>(up, "YouTube upload");
    const note = input.thumbnailUrl ? await setThumbnail(token, video.id, input.thumbnailUrl) : undefined;
    return { ok: true, id: video.id, ...(note && { note }) };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** thumbnails.set (JPEG/PNG, max 50 MB). Returns a note on failure; the video itself is already posted.
 *  Custom thumbnails need a channel allowed to use them (403 forbidden otherwise). */
async function setThumbnail(token: string, videoId: string, url: string): Promise<string | undefined> {
  try {
    const { bytes, contentType } = await downloadImage(url, 50 * 1024 * 1024, ["image/jpeg", "image/png"]);
    const res = await tfetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?${new URLSearchParams({ videoId, uploadType: "media" })}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType }, body: new Uint8Array(bytes) },
      120_000
    );
    await readJson(res, "YouTube thumbnail");
    return undefined;
  } catch (e) {
    const msg = errMsg(e);
    return `Thumbnail not applied: ${msg}${/ 403:/.test(msg) ? " (the channel may need to be verified to use custom thumbnails)" : ""}`;
  }
}
