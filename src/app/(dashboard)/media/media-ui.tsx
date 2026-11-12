"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Label, Select, Textarea } from "@/components/ui";
import type { GenModel, MediaKind } from "@/lib/media/generate";
import { deleteMedia, generateMedia, getModelPrice, getModels, refreshMedia } from "./actions";

export function GeneratePanel({ initialKind, costs, credits, hasContext }: { initialKind: MediaKind; costs: Record<MediaKind, number>; credits: number; hasContext: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<MediaKind>(initialKind);
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

  const submit = () =>
    start(async () => {
      setMsg(null);
      const res = await generateMedia({ kind, prompt, model: modelId, aspectRatio: aspect || undefined, duration: Number(duration) || undefined, resolution: resolution || undefined, useContext });
      if (res.ok) {
        setMsg({ ok: true, text: kind === "video" ? "Video started — it will appear in the library when ready (usually 1–5 min)." : "Image added to your library." });
        setPrompt("");
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    });

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Generate with AI</h2>
        <div className="flex rounded-md border border-zinc-300 p-0.5 text-sm">
          {(["image", "video"] as const).map((k) => (
            <button key={k} type="button" onClick={() => k !== kind && (setModels(null), setKind(k))} className={`rounded px-3 py-1.5 capitalize ${kind === k ? "bg-brand-600 text-white" : "text-zinc-600"}`}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Prompt</Label>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={4000} placeholder={kind === "image" ? "A flat-lay photo of our summer smoothie bowls on a marble counter, soft morning light" : "Slow dolly shot through a sunlit café as a barista pours latte art"} />
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
        <Button type="button" onClick={submit} disabled={busy || !prompt.trim() || !model || credits < cost}>
          {busy ? (kind === "image" ? "Generating…" : "Starting…") : `Generate ${kind} · ${cost} credits`}
        </Button>
      </div>
      {credits < cost && <p className="text-xs text-red-600">Not enough credits ({credits} left).</p>}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </Card>
  );
}

export function Uploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ busy?: boolean; error?: string; done?: string }>({});

  const upload = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setStatus({ busy: true });
    for (const f of list) {
      try {
        const r = await fetch("/api/media", { method: "POST", body: f, headers: { "Content-Type": f.type || "application/octet-stream", "X-File-Name": encodeURIComponent(f.name) } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setStatus({ error: `${f.name}: ${j.error || `upload failed (${r.status})`}` });
          router.refresh();
          return;
        }
      } catch {
        setStatus({ error: `${f.name}: upload failed` });
        return;
      }
    }
    setStatus({ done: `Uploaded ${list.length} file${list.length > 1 ? "s" : ""}.` });
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900">Upload</h2>
      <label
        className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 hover:bg-zinc-50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
      >
        <input ref={input} type="file" multiple className="sr-only" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={(e) => upload(e.target.files)} disabled={status.busy} />
        <span className="font-medium text-zinc-800">{status.busy ? "Uploading…" : "Choose or drop files"}</span>
        <span className="text-xs text-zinc-500">PNG, JPEG, WebP, GIF up to 20 MB · MP4, WebM, MOV up to 200 MB</span>
      </label>
      {status.error && <p className="text-xs text-red-600">{status.error}</p>}
      {status.done && <p className="text-xs text-emerald-700">{status.done}</p>}
    </Card>
  );
}

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
