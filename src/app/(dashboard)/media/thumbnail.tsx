"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button, Label, Textarea } from "@/components/ui";
import { generateThumbnail, setThumbnail } from "./actions";

/** Uploads an image blob to the library and returns its id. */
async function uploadImage(blob: Blob, name: string): Promise<string> {
  const r = await fetch("/api/media", { method: "POST", body: blob, headers: { "Content-Type": blob.type, "X-File-Name": encodeURIComponent(name) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(j.error || `Upload failed (${r.status})`);
  return j.id as string;
}

/**
 * "Thumbnail" button on a library video. Three ways to set the cover:
 * pick a frame from the video, upload an image, or generate one with AI.
 */
export function ThumbnailButton({ videoId, src, thumbUrl, prompt, cost }: { videoId: string; src: string; thumbUrl: string | null; prompt: string | null; cost: number }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(prompt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"frame" | "upload" | "ai" | "remove" | null>(null);
  const [, start] = useTransition();

  const run = (kind: NonNullable<typeof busy>, job: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    setBusy(kind);
    start(async () => {
      try {
        const res = await job();
        if (res.ok) {
          setOpen(false);
          router.refresh();
        } else setError(res.error || "Something went wrong");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(null);
      }
    });
  };

  const useFrame = () =>
    run("frame", async () => {
      const v = video.current;
      if (!v || !v.videoWidth) throw new Error("The video hasn't loaded yet. Press play, pause on the frame you want, then try again.");
      const scale = Math.min(1, 1280 / v.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("Couldn't capture this frame. Upload an image instead.");
      return setThumbnail(videoId, await uploadImage(blob, "Video thumbnail (frame)"));
    });

  const upload = (file: File | undefined) => {
    if (!file) return;
    run("upload", async () => setThumbnail(videoId, await uploadImage(file, file.name)));
  };

  return (
    <>
      <Button type="button" variant="secondary" className="h-9 gap-1.5 px-2.5 text-xs" onClick={() => setOpen(true)}>
        <ImagePlus size={14} strokeWidth={1.75} aria-hidden />
        {thumbUrl ? "Change thumbnail" : "Add thumbnail"}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Video thumbnail">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-[14px] border border-zinc-200 bg-white sm:rounded-[14px]">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h3 className="font-semibold text-zinc-900">Video thumbnail</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100">
                <X size={18} strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto p-4">
              <section>
                <h4 className="text-sm font-medium text-zinc-900">Pick a frame</h4>
                <p className="mt-0.5 text-[0.8125rem] text-zinc-500">Play or scrub to the moment you want, then use it.</p>
                <video ref={video} src={src} controls preload="metadata" playsInline className="mt-2 max-h-56 w-full rounded-md bg-zinc-100" />
                <Button type="button" variant="secondary" className="mt-2 w-full gap-2 sm:w-auto" onClick={useFrame} disabled={!!busy}>
                  <Camera size={15} strokeWidth={1.75} aria-hidden />
                  {busy === "frame" ? "Saving…" : "Use this frame"}
                </Button>
              </section>

              <section className="border-t border-zinc-100 pt-5">
                <h4 className="text-sm font-medium text-zinc-900">Upload an image</h4>
                <p className="mt-0.5 text-[0.8125rem] text-zinc-500">PNG, JPEG or WebP, up to 20 MB. 16:9 works best.</p>
                <label className={`mt-2 inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 sm:w-auto ${busy ? "pointer-events-none opacity-45" : ""}`}>
                  <Upload size={15} strokeWidth={1.75} aria-hidden />
                  {busy === "upload" ? "Uploading…" : "Choose image"}
                  <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" disabled={!!busy} onChange={(e) => upload(e.target.files?.[0])} />
                </label>
              </section>

              <section className="border-t border-zinc-100 pt-5">
                <h4 className="text-sm font-medium text-zinc-900">Generate with AI</h4>
                <Label className="mt-2">Describe the thumbnail</Label>
                <Textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3} maxLength={1000} placeholder="A barista pouring latte art, warm light, space on the left for a title" />
                <Button type="button" className="mt-2 w-full gap-2 sm:w-auto" onClick={() => run("ai", () => generateThumbnail(videoId, aiPrompt))} disabled={!!busy || !aiPrompt.trim()}>
                  <Sparkles size={15} strokeWidth={1.75} aria-hidden />
                  {busy === "ai" ? "Generating…" : `Generate, ${cost} credits`}
                </Button>
              </section>

              {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </div>

            {thumbUrl && (
              <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3">
                <span className="flex min-w-0 items-center gap-2 text-[0.8125rem] text-zinc-600">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl} alt="Current thumbnail" className="h-9 w-16 shrink-0 rounded border border-zinc-200 object-cover" />
                  Current thumbnail
                </span>
                <Button type="button" variant="ghost" className="shrink-0 gap-1.5 text-red-700" onClick={() => run("remove", () => setThumbnail(videoId, null))} disabled={!!busy}>
                  <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                  {busy === "remove" ? "Removing…" : "Remove"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
