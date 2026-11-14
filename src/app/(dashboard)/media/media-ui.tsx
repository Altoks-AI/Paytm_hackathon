"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui";
import { deleteMedia, refreshMedia } from "./actions";

/** While videos render: poll the provider every 6s via a server action and refresh the page when something finishes. */
export function PendingPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const left = await refreshMedia().catch(() => -1);
      if (stop) return;
      if (left === 0) router.refresh();
      else timer = setTimeout(tick, 6000);
    };
    timer = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [active, router]);
  return null;
}

export function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-8 px-2.5 text-xs"
      onClick={() => navigator.clipboard.writeText(url).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
      title={url}
    >
      {copied ? "Copied!" : "Copy public URL"}
    </Button>
  );
}

export function DeleteMedia({ id }: { id: string }) {
  const [busy, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-8 px-2.5 text-xs text-red-600"
      disabled={busy}
      onClick={() => confirm("Delete this file? Posts already using its URL will lose the media.") && start(() => deleteMedia(id))}
    >
      {busy ? "Deleting…" : "Delete"}
    </Button>
  );
}

export function LocalDate({ iso }: { iso: string }) {
  return <time suppressHydrationWarning dateTime={iso}>{new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>;
}

/** Library tile media: click to open it large in a dialog (X, backdrop click or Esc closes). */
export function MediaPreview({ kind, src, poster, alt }: { kind: "image" | "video"; src: string; poster?: string; alt: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`View ${kind} larger`} className="group relative h-full w-full cursor-zoom-in">
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} loading="lazy" className="h-full w-full object-contain" />
        ) : (
          <>
            <video src={src} poster={poster} preload={poster ? "none" : "metadata"} muted playsInline className="pointer-events-none h-full w-full" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900/60 text-white group-hover:bg-zinc-900/80"><Play size={20} aria-hidden /></span>
            </span>
          </>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setOpen(false)}>
          <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-[14px] border border-zinc-200 bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2">
              <p className="min-w-0 truncate text-sm text-zinc-700">{alt}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" autoFocus className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100">
                <X size={18} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-100">
              {kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={alt} className="max-h-[82vh] max-w-full object-contain" />
              ) : (
                <video src={src} poster={poster} controls autoPlay playsInline className="max-h-[82vh] max-w-full" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
