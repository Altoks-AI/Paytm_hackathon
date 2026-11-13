"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { MediaGeneratorPanel } from "../media/media-generator-panel";
import { pollMedia } from "../media/actions";
import { PLATFORM_LABEL, PLATFORM_MAX, PLATFORM_MEDIA, PLATFORMS, type MediaType, type Platform } from "@/lib/social/platforms";
import { generatePostText, savePost } from "./actions";
import { LibraryPicker } from "./library-picker";

type Initial = { id: string; title: string; content: string; mediaType: string; mediaUrl: string; thumbnailUrl: string; platforms: string[]; scheduledAt: string | null } | null;

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function Composer({ connected, initial, imageCost, videoCost, credits, hasContext }: { connected: Record<Platform, boolean>; initial: Initial; imageCost: number; videoCost: number; credits: number; hasContext: boolean }) {
  const [state, formAction, saving] = useActionState(savePost, undefined);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.thumbnailUrl ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [mediaType, setMediaType] = useState<MediaType>((initial?.mediaType as MediaType) || "text");
  const [mediaUrl, setMediaUrl] = useState(initial?.mediaUrl ?? "");
  const [platforms, setPlatforms] = useState<string[]>(initial?.platforms ?? []);
  const [when, setWhen] = useState(() => (initial?.scheduledAt && typeof window !== "undefined" ? toLocalInput(initial.scheduledAt) : ""));

  const [topic, setTopic] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [writing, startWriting] = useTransition();

  // A video being generated for the main media slot. Owned here (not by the picker panel) so polling survives the panel collapsing.
  const [videoJob, setVideoJob] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoJob) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await pollMedia(videoJob).catch(() => null);
      if (stop) return;
      if (r?.status === "ready") {
        setMediaUrl(r.item.url);
        if (r.item.thumbUrl) setThumbnailUrl(r.item.thumbUrl);
        setVideoJob(null);
      } else if (r?.status === "failed") {
        setVideoError(`Video generation failed: ${r.error}. Credits were refunded.`);
        setVideoJob(null);
      } else timer = setTimeout(tick, 6000);
    };
    timer = setTimeout(tick, 3000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [videoJob]);

  const changeType = (t: MediaType) => {
    setMediaType(t);
    setVideoJob(null);
    setVideoError(null);
  };

  const costs = { image: imageCost, video: videoCost };

  const reason = (p: Platform) =>
    !connected[p] ? "connect in Integrations" : !PLATFORM_MEDIA[p].includes(mediaType) ? (p === "youtube" ? "needs a video" : "needs image or video") : null;
  const selected = PLATFORMS.filter((p) => platforms.includes(p) && !reason(p));
  const length = [...content].length;
  const tooLong = selected.filter((p) => length > PLATFORM_MAX[p]);

  const toggle = (p: Platform) => setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const writeWithAi = () =>
    startWriting(async () => {
      setAiError(null);
      const res = await generatePostText({ topic, platforms: selected, mediaType });
      if (res.text) {
        setContent(res.text);
        if (res.title && mediaType === "video") setTitle(res.title);
      } else setAiError(res.error || "Generation failed");
    });

  const isVideo = mediaType === "video";
  const needsTitle = isVideo && selected.includes("youtube");
  const missingTitle = needsTitle && !title.trim();

  let scheduledIso = "";
  if (when) {
    const d = new Date(when);
    if (!isNaN(d.getTime())) scheduledIso = d.toISOString();
  }

  return (
    <Card>
      <form action={formAction} className="space-y-5">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        <input type="hidden" name="scheduledAt" value={scheduledIso} />
        {selected.map((p) => (
          <input key={p} type="hidden" name="platforms" value={p} />
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">{initial ? "Edit post" : "New post"}</h2>
          {initial && (
            <Link href="/social" className="text-sm text-zinc-500 hover:text-zinc-800">
              Cancel edit
            </Link>
          )}
        </div>

        <input type="hidden" name="thumbnailUrl" value={isVideo ? thumbnailUrl : ""} />

        {isVideo && (
          <div>
            <Label hint={needsTitle ? "required for YouTube, up to 100 characters" : "optional, used where the platform shows a video title"}>Title</Label>
            <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="A short, clear title for the video" />
          </div>
        )}

        <div>
          <Label hint={`${length} chars${selected.includes("twitter") ? " / 280 for X" : ""}`}>{mediaType === "text" ? "Post text" : "Description"}</Label>
          <Textarea
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder={mediaType === "text" ? "What do you want to share?" : `The text that goes with your ${mediaType}`}
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Or tell AI what it's about, e.g. launch of our new summer menu" className="flex-1" />
            <Button type="button" variant="secondary" onClick={writeWithAi} disabled={writing || !topic.trim()}>
              {writing ? "Writing…" : isVideo ? "Write title and description, 1 credit" : "Write with AI, 1 credit"}
            </Button>
          </div>
          {aiError && <p className="mt-1 text-xs text-red-600">{aiError}</p>}
          {tooLong.length > 0 && <p className="mt-1 text-xs text-red-600">Too long for {tooLong.map((p) => `${PLATFORM_LABEL[p]} (${PLATFORM_MAX[p]})`).join(", ")}</p>}
        </div>

        <div className="sm:max-w-[200px]">
          <Label>Post type</Label>
          <Select name="mediaType" value={mediaType} onChange={(e) => changeType(e.target.value as MediaType)}>
            <option value="text">Text only</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </Select>
        </div>

        {mediaType !== "text" && (
          <div className="space-y-3 rounded-[10px] border border-zinc-200 p-4">
            <LibraryPicker
              key={mediaType}
              kind={mediaType}
              label={mediaType === "image" ? "Add your image" : "Add your video"}
              onPick={(p) => {
                setVideoJob(null);
                setVideoError(null);
                setMediaUrl(p.url);
                if (p.kind === "video") setThumbnailUrl(p.thumbUrl ?? "");
              }}
              renderGenerate={(close) => (
                <MediaGeneratorPanel
                  mode={mediaType}
                  costs={costs}
                  credits={credits}
                  hasContext={hasContext}
                  onClose={close}
                  onGenerated={(item) => setMediaUrl(item.url)}
                  onVideoStarted={(id) => {
                    setVideoError(null);
                    setVideoJob(id);
                  }}
                />
              )}
            />
            {videoJob && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-800" />
                Generating your video (usually 1–5 min). You can keep editing; it will attach here when ready.
              </div>
            )}
            {videoError && <p className="text-sm text-red-600">{videoError}</p>}
            {/^https?:\/\//.test(mediaUrl) && (
              <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
                {mediaType === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl} alt="Preview" className="max-h-72 w-full object-contain" />
                ) : (
                  <video src={mediaUrl} poster={thumbnailUrl || undefined} controls playsInline className="max-h-72 w-full" />
                )}
              </div>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-800">Or paste a public link</summary>
              <Input name="mediaUrl" type="url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" className="mt-2" />
            </details>

            {isVideo && (
              <div className="space-y-2 border-t border-zinc-100 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.8125rem] font-medium text-zinc-800">
                    Thumbnail <span className="font-normal text-zinc-500">optional, used on YouTube, Instagram, Facebook and LinkedIn</span>
                  </p>
                  {thumbnailUrl && (
                    <button type="button" onClick={() => setThumbnailUrl("")} className="text-xs text-red-700 underline">
                      Remove thumbnail
                    </button>
                  )}
                </div>
                {thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailUrl} alt="Thumbnail" className="h-24 rounded-md border border-zinc-200 object-cover" />
                )}
                <LibraryPicker
                  kind="image"
                  onPick={(p) => setThumbnailUrl(p.url)}
                  renderGenerate={(close) => <MediaGeneratorPanel mode="image" costs={costs} credits={credits} hasContext={hasContext} onClose={close} onGenerated={(item) => setThumbnailUrl(item.url)} />}
                />
              </div>
            )}
          </div>
        )}

        <div>
          <Label>Platforms</Label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const why = reason(p);
              const on = selected.includes(p);
              return (
                <label
                  key={p}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${why ? "cursor-not-allowed border-zinc-200 text-zinc-400" : on ? "cursor-pointer border-zinc-900 bg-brand-600 text-white" : "cursor-pointer border-zinc-300 text-zinc-800 hover:bg-zinc-50"}`}
                >
                  <input type="checkbox" className="sr-only" checked={on} disabled={!!why} onChange={() => toggle(p)} />
                  {PLATFORM_LABEL[p]}
                  {why && (why === "connect in Integrations" ? <Link href="/integrations" className="text-xs underline">{why}</Link> : <span className="text-xs">({why})</span>)}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-4">
          <Button name="intent" value="post" disabled={saving || !selected.length || tooLong.length > 0 || missingTitle}>
            Post now
          </Button>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <div className="min-w-0">
              <Label className="text-xs">Schedule for</Label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-9 py-1" suppressHydrationWarning />
            </div>
            <Button name="intent" value="schedule" variant="secondary" disabled={saving || !selected.length || !scheduledIso || tooLong.length > 0 || missingTitle}>
              Schedule
            </Button>
          </div>
          <Button name="intent" value="draft" variant="ghost" disabled={saving}>
            Save draft
          </Button>
          {saving && <span className="text-sm text-zinc-500">Saving…</span>}
        </div>
        {missingTitle && <p className="text-sm text-amber-800">Add a title to post this video to YouTube.</p>}
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>
    </Card>
  );
}

/** Refreshes the page every 5s while any post is still publishing. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

export function LocalTime({ iso }: { iso: string }) {
  return <time suppressHydrationWarning dateTime={iso}>{new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>;
}
