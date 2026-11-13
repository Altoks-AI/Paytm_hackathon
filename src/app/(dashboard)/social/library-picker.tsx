"use client";

import { useState, useTransition, type ReactNode } from "react";
import { FolderOpen, Sparkles, Upload } from "lucide-react";
import { listLibrary, type LibraryItem } from "../media/actions";

type Kind = "image" | "video";
type Picked = { url: string; kind: Kind; thumbUrl: string | null };

/**
 * Media source for the composer. Three equal options: upload a file, generate with AI (panel supplied by the composer),
 * or choose something already in the library. Every path ends with a library file, returned through onPick.
 */
export function LibraryPicker({ kind, onPick, label, renderGenerate }: { kind: Kind; onPick: (p: Picked) => void; label?: string; renderGenerate?: (close: () => void) => ReactNode }) {
  const [panel, setPanel] = useState<"library" | "generate" | null>(null);
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | null>(null);
  const [loading, start] = useTransition();

  const pick = (i: LibraryItem) => {
    onPick({ url: i.url, kind: i.kind, thumbUrl: i.thumbUrl });
    setPanel(null);
  };

  const openLibrary = () => {
    if (panel === "library") return setPanel(null);
    setPanel("library");
    start(async () => setItems(await listLibrary()));
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy("upload");
    try {
      const r = await fetch("/api/media", { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(j.error || `Upload failed (${r.status})`);
      const found = (await listLibrary()).find((i) => i.id === j.id);
      if (!found) throw new Error("Uploaded, but the file could not be found in your library");
      pick(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const shown = items?.filter((i) => i.kind === kind) ?? [];
  const accept = kind === "image" ? "image/png,image/jpeg,image/webp,image/gif" : "video/mp4,video/webm,video/quicktime";
  const option = "inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors";
  const idle = "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50";
  const active = "border-brand-600 bg-brand-50 text-brand-700";

  return (
    <div className="space-y-2">
      {label && <p className="text-[0.8125rem] font-medium text-zinc-800">{label}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className={`${option} ${idle} ${busy ? "pointer-events-none opacity-45" : ""}`}>
          <Upload size={15} strokeWidth={1.75} aria-hidden />
          {busy === "upload" ? "Uploading…" : "Upload"}
          <input type="file" className="sr-only" accept={accept} disabled={!!busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <button type="button" className={`${option} ${panel === "generate" ? active : idle}`} onClick={() => setPanel(panel === "generate" ? null : "generate")}>
          <Sparkles size={15} strokeWidth={1.75} aria-hidden />
          Generate with AI
        </button>
        <button type="button" className={`${option} ${panel === "library" ? active : idle}`} onClick={openLibrary}>
          <FolderOpen size={15} strokeWidth={1.75} aria-hidden />
          Choose from library
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {panel === "generate" && renderGenerate?.(() => setPanel(null))}

      {panel === "library" && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          {loading || !items ? (
            <p className="text-xs text-zinc-500">Loading…</p>
          ) : !shown.length ? (
            <p className="text-xs text-zinc-500">No {kind === "image" ? "images" : "videos"} in your library yet. Upload or generate one above.</p>
          ) : (
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
              {shown.map((i) => (
                <button key={i.id} type="button" title={i.prompt ?? undefined} onClick={() => pick(i)} className="relative aspect-square overflow-hidden rounded-md border border-zinc-200 bg-white hover:ring-2 hover:ring-brand-600">
                  {i.kind === "image" || i.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.kind === "image" ? i.url : i.thumbUrl!} alt={i.prompt ?? i.kind} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <video src={i.url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
