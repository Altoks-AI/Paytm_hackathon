import type { ProviderConfig } from "@/lib/integrations";
import { GRAPH_VERSION } from "./facebook";
import { checkInput, downloadImage, errMsg, readJson, sleep, tfetch, type PostInput, type PostResult } from "./util";

type Creds = ProviderConfig["instagram"];

export async function post(c: Creds, input: PostInput): Promise<PostResult> {
  try {
    if (input.mediaType === "text") return { ok: false, error: "Instagram does not support text-only posts — attach an image or video" };
    const bad = checkInput("instagram", input);
    if (bad) return { ok: false, error: bad };
    if (!c.igUserId || !c.accessToken) return { ok: false, error: "Instagram credentials incomplete (igUserId, accessToken)" };
    // Instagram-Login tokens (IG...) use graph.instagram.com; Facebook-Login tokens use graph.facebook.com.
    const base = `${c.accessToken.startsWith("IG") ? "https://graph.instagram.com" : "https://graph.facebook.com"}/${GRAPH_VERSION}`;
    const token = c.accessToken;

    const create = new URLSearchParams({ access_token: token, caption: input.content });
    let note: string | undefined;
    if (input.mediaType === "image") create.set("image_url", input.mediaUrl!);
    else {
      create.set("media_type", "REELS");
      create.set("video_url", input.mediaUrl!);
      // Reels cover: cover_url must be a public JPEG of at most 8 MB (Instagram crops it to 9:16).
      if (input.thumbnailUrl) {
        try {
          await downloadImage(input.thumbnailUrl, 8 * 1024 * 1024, ["image/jpeg"]);
          create.set("cover_url", input.thumbnailUrl);
        } catch (e) {
          note = `Cover not applied: ${errMsg(e)}`;
        }
      }
    }
    const createContainer = async () =>
      readJson<{ id: string }>(await tfetch(`${base}/${encodeURIComponent(c.igUserId)}/media`, { method: "POST", body: create }, 60_000), "Instagram container");
    let container: { id: string };
    try {
      container = await createContainer();
    } catch (e) {
      if (!create.has("cover_url")) throw e;
      create.delete("cover_url"); // never fail the reel because of its cover
      note = `Cover not applied: ${errMsg(e)}`;
      container = await createContainer();
    }

    // Poll until FINISHED (videos can take a few minutes).
    for (let i = 0; ; i++) {
      const st = await readJson<{ status_code?: string; status?: string }>(
        await tfetch(`${base}/${container.id}?${new URLSearchParams({ fields: "status_code,status", access_token: token })}`),
        "Instagram status"
      );
      if (st.status_code === "FINISHED" || st.status_code === "PUBLISHED") break;
      if (st.status_code === "ERROR" || st.status_code === "EXPIRED") throw new Error(`Instagram media processing ${st.status_code}: ${st.status || ""}`);
      if (i >= 60) throw new Error("Instagram media is still processing — try again later");
      await sleep(input.mediaType === "image" ? 2000 : 5000);
    }

    const pub = await readJson<{ id: string }>(
      await tfetch(`${base}/${encodeURIComponent(c.igUserId)}/media_publish`, { method: "POST", body: new URLSearchParams({ access_token: token, creation_id: container.id }) }, 60_000),
      "Instagram publish"
    );
    return { ok: true, id: pub.id, ...(note && { note }) };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
