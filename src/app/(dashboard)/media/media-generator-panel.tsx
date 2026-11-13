"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Paperclip, Plus, X } from "lucide-react";
import { Button, Card, Label, Select, Textarea } from "@/components/ui";
import type { GenModel, MediaKind } from "@/lib/media/generate";
import { MAX_REFERENCES, MODEL_NEEDS_REFERENCE, NO_REFERENCE_SUPPORT, REFERENCE_IMAGE_MIMES, REFERENCE_VIDEO_MIMES, referenceSupport, requiresReference, validateReferenceFile } from "@/lib/media/references";
import { generateMedia, getModelPrice, getModels, listLibrary, type LibraryItem } from "./actions";

type Ref = { id: string; src: string; name: string };

export type GeneratedItem = LibraryItem;

export function MediaGeneratorPanel({ mode, initialKind = "image", costs, credits, hasContext, onGenerated, onVideoStarted, onClose }: {
  /** Fixes the media type and hides the Image/Video toggle. */
  mode?: MediaKind;
  initialKind?: MediaKind;
  costs: Record<MediaKind, number>;
  credits: number;
  hasContext: boolean;
  /** Called with the saved library item once an image is ready. */
  onGenerated?: (item: LibraryItem) => void;
  /** Called with the library file id once a video job has started (it renders for minutes; the owner polls and attaches). */
  onVideoStarted?: (id: string) => void;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<MediaKind>(mode ?? initialKind);
  const [models, setModels] = useState<GenModel[] | null>(null);
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("");
  const [duration, setDuration] = useState("");
  const [resolution, setResolution] = useState("");
  const [useContext, setUseContext] = useState(false);
  const [imagePrice, setImagePrice] = useState<Record<string, string | null>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [refs, setRefs] = useState<Ref[]>([]);
  const [uploading, setUploading] = useState(0);
  const [refError, setRefError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[] | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const selectModel = (m: GenModel) => {
    setModelId(m.id);
    setAspect(m.kind === "video" && m.aspectRatios.includes("16:9") ? "16:9" : m.aspectRatios.includes("1:1") ? "1:1" : (m.aspectRatios[0] ?? ""));
    setDuration(m.durations?.length ? String(m.durations.find((d) => d >= 5) ?? m.durations[0]) : "");
    setResolution(m.resolutions?.includes("720p") ? "720p" : (m.resolutions?.[0] ?? ""));
    if (m.kind === "image" && !(m.id in imagePrice)) getModelPrice(m.id).then((p) => setImagePrice((cur) => ({ ...cur, [m.id]: p })));
  };

  useEffect(() => {
    let live = true;
    getModels(kind).then((list) => {
      if (!live) return;
      setModels(list);
      if (list[0]) selectModel(list[0]);
    });
    return () => {
      live = false;
    };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps -- reload only when the type changes

  const model = models?.find((m) => m.id === modelId);
  const price = model?.kind === "video" ? model.price : model ? imagePrice[model.id] : null;
  const cost = costs[kind];
  const support = referenceSupport(model);
  const accept = [...REFERENCE_IMAGE_MIMES, ...(kind === "video" && support.video ? REFERENCE_VIDEO_MIMES : [])].join(",");
  const refsBlocked = refs.length > 0 && !support.images;
  const needsRef = requiresReference(model) && refs.length === 0;

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setRefError(null);
    if (!support.images) return setRefError(NO_REFERENCE_SUPPORT);
    const room = MAX_REFERENCES - refs.length - uploading;
    if (room <= 0) return setRefError(`You can attach up to ${MAX_REFERENCES} references.`);
    const batch = files.slice(0, room);
    if (files.length > room) setRefError(`Only ${MAX_REFERENCES} references are allowed; extra files were skipped.`);
    setUploading((n) => n + batch.length);
    for (const f of batch) {
      const err = validateReferenceFile(f, support, kind);
      try {
        if (err) throw new Error(err);
        const r = await fetch("/api/media", { method: "POST", body: f, headers: { "Content-Type": f.type, "X-File-Name": encodeURIComponent(f.name) } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.id) throw new Error(`${f.name}: ${j.error || `upload failed (${r.status})`}`);
        setRefs((cur) => [...cur, { id: j.id, src: `/api/media/${j.publicId}`, name: f.name }]);
      } catch (e) {
        setRefError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const toggleLibrary = async () => {
    setLibOpen((o) => !o);
    if (!library) setLibrary(await listLibrary("image").catch(() => []));
  };

  const pickFromLibrary = (i: LibraryItem) => {
    setRefError(null);
    if (refs.some((r) => r.id === i.id)) return;
    if (refs.length + uploading >= MAX_REFERENCES) return setRefError(`You can attach up to ${MAX_REFERENCES} references.`);
    setRefs((cur) => [...cur, { id: i.id, src: i.url, name: i.prompt || "Library image" }]);
  };

  const submit = () => {
    if (needsRef) return;
    start(async () => {
      setMsg(null);
      const res = await generateMedia({ kind, prompt, model: modelId, aspectRatio: aspect || undefined, duration: Number(duration) || undefined, resolution: resolution || undefined, useContext, referenceIds: refs.map((r) => r.id) });
      if (res.ok) {
        setPrompt("");
        setRefs([]);
        router.refresh();
        if (kind === "video") {
          if (onVideoStarted) onVideoStarted(res.id);
          else setMsg({ ok: true, text: "Video started — it will appear in the library when ready (usually 1–5 min)." });
          if (onVideoStarted) onClose?.();
          return;
        }
        const item = onGenerated ? (await listLibrary("image").catch(() => [])).find((i) => i.id === res.id) : undefined;
        if (onGenerated && !item) return setMsg({ ok: false, text: "Generated, but the image could not be found in your library" });
        setMsg({ ok: true, text: "Image added to your library." });
        if (item) onGenerated?.(item);
        onClose?.();
      } else setMsg({ ok: false, text: res.error });
    });
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Generate with AI</h2>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" className="ml-auto text-zinc-500 hover:text-zinc-800"><X size={16} aria-hidden /></button>}
        {!mode && <div className="flex rounded-md border border-zinc-300 p-0.5 text-sm">
          {(["image", "video"] as const).map((k) => (
            <button key={k} type="button" onClick={() => k !== kind && (setModels(null), setRefs([]), setRefError(null), setKind(k))} className={`rounded px-3 py-1.5 capitalize ${kind === k ? "bg-brand-600 text-white" : "text-zinc-600"}`}>
              {k}
            </button>
          ))}
        </div>}
      </div>
      <div>
        <Label>Prompt</Label>
        <div
          className={`relative rounded-md ${dragging ? "ring-2 ring-brand-600" : ""}`}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
        >
        <Textarea className={refs.length || uploading ? "pb-24!" : "pb-12!"} onPaste={(e) => { const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/")); if (files.length) { e.preventDefault(); addFiles(files); } }} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={4000} placeholder={kind === "image" ? "A flat-lay photo of our summer smoothie bowls on a marble counter, soft morning light" : "Slow dolly shot through a sunlit café as a barista pours latte art"} />
        <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={!support.images || refs.length + uploading >= MAX_REFERENCES}
            title={support.images ? `Attach reference image (up to ${MAX_REFERENCES})` : NO_REFERENCE_SUPPORT}
            aria-label="Attach reference"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={16} aria-hidden />
          </button>
          <input ref={fileInput} type="file" multiple className="sr-only" accept={accept} onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <button
            type="button"
            onClick={toggleLibrary}
            disabled={!support.images}
            title={support.images ? "Choose a reference from your library" : NO_REFERENCE_SUPPORT}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <FolderOpen size={14} aria-hidden /> Library
          </button>
          {refs.map((r) => (
            <span key={r.id} className="relative h-10 w-10 overflow-hidden rounded-md border border-zinc-300 bg-white" title={r.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.src} alt={r.name} className="h-full w-full object-cover" />
              <button type="button" aria-label={`Remove ${r.name}`} onClick={() => setRefs((cur) => cur.filter((x) => x.id !== r.id))} className="absolute right-0 top-0 rounded-bl bg-zinc-900/70 p-0.5 text-white hover:bg-zinc-900">
                <X size={10} aria-hidden />
              </button>
            </span>
          ))}
          {uploading > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <Paperclip size={12} aria-hidden /> Uploading…
            </span>
          )}
        </div>
        </div>
        {libOpen && (
          <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            {!library ? (
              <p className="text-xs text-zinc-500">Loading…</p>
            ) : !library.length ? (
              <p className="text-xs text-zinc-500">No images in your library yet.</p>
            ) : (
              <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                {library.map((i) => (
                  <button key={i.id} type="button" title={i.prompt ?? undefined} onClick={() => pickFromLibrary(i)} className={`aspect-square overflow-hidden rounded-md border bg-white hover:ring-2 hover:ring-brand-600 ${refs.some((r) => r.id === i.id) ? "ring-2 ring-brand-600" : "border-zinc-200"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.url} alt={i.prompt ?? "image"} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {refError && <p className="mt-1.5 text-xs text-red-600">{refError}</p>}
        {needsRef && <p className="mt-1.5 text-xs text-red-600">{MODEL_NEEDS_REFERENCE}</p>}
        {refsBlocked && <p className="mt-1.5 text-xs text-red-600">{NO_REFERENCE_SUPPORT} Remove the references or pick another model.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label hint={price ?? undefined}>Model</Label>
          <Select value={modelId} onChange={(e) => { const m = models?.find((x) => x.id === e.target.value); if (m) selectModel(m); }} disabled={!models}>
            {!models && <option>Loading models…</option>}
            {models?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.price ? ` — ${m.price}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Aspect ratio</Label>
          <Select value={aspect} onChange={(e) => setAspect(e.target.value)} disabled={!model}>
            {model?.aspectRatios.map((a) => <option key={a}>{a}</option>)}
          </Select>
        </div>
        {kind === "video" && (
          <div>
            <Label>Duration</Label>
            <Select value={duration} onChange={(e) => setDuration(e.target.value)} disabled={!model?.durations?.length}>
              {model?.durations?.map((d) => <option key={d} value={d}>{d}s</option>)}
            </Select>
          </div>
        )}
        {kind === "video" && !!model?.resolutions?.length && (
          <div>
            <Label>Resolution</Label>
            <Select value={resolution} onChange={(e) => setResolution(e.target.value)}>
              {model.resolutions.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className={`flex items-center gap-2 text-sm ${hasContext ? "text-zinc-700" : "text-zinc-400"}`} title={hasContext ? "" : "Add a company profile in Settings first"}>
          <input type="checkbox" checked={useContext} disabled={!hasContext} onChange={(e) => setUseContext(e.target.checked)} />
          Use company context
        </label>
        <Button type="button" onClick={submit} disabled={busy || uploading > 0 || refsBlocked || needsRef || !prompt.trim() || !model || credits < cost}>
          {busy ? (kind === "image" ? "Generating…" : "Starting…") : uploading > 0 ? "Uploading reference…" : `Generate ${kind} · ${cost} credits`}
        </Button>
      </div>
      {credits < cost && <p className="text-xs text-red-600">Not enough credits ({credits} left).</p>}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </Card>
  );
}
