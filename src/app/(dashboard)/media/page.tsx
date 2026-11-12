import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaFiles } from "@/db/schema";
import { CREDIT_COSTS } from "@/lib/credits";
import { appUrl, requireTenant } from "@/lib/tenant";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { CopyUrl, DeleteMedia, GeneratePanel, LocalDate, PendingPoller, Uploader } from "./media-ui";
import { ThumbnailButton } from "./thumbnail";
import { getThumbnailUrls } from "./actions";

type SP = Promise<{ kind?: string; generate?: string }>;

export default function MediaPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Media library" description="Generate images and videos with AI, or upload your own. Use them in social posts." />
      <Suspense fallback={<div className="text-sm text-zinc-500">Loading…</div>}>
        <MediaContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function MediaContent({ searchParams }: { searchParams: SP }) {
  const { tenantId, tenant } = await requireTenant();
  const sp = await searchParams;
  const kind = sp.kind === "image" || sp.kind === "video" ? sp.kind : null;
  const rows = await db
    .select()
    .from(mediaFiles)
    .where(kind ? and(eq(mediaFiles.tenantId, tenantId), eq(mediaFiles.kind, kind)) : eq(mediaFiles.tenantId, tenantId))
    .orderBy(desc(mediaFiles.createdAt))
    .limit(200);
  const base = appUrl();
  const thumbs = await getThumbnailUrls(rows);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <GeneratePanel
          initialKind={sp.generate === "video" ? "video" : "image"}
          costs={{ image: CREDIT_COSTS.image_generation.cost, video: CREDIT_COSTS.video_generation.cost }}
          credits={tenant.credits}
          hasContext={!!tenant.companySummary}
        />
        <Uploader />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Library</h2>
          <div className="flex gap-1 overflow-x-auto text-sm">
            {[
              ["All", null],
              ["Images", "image"],
              ["Videos", "video"],
            ].map(([label, k]) => (
              <Link
                key={label}
                href={k ? `/media?kind=${k}` : "/media"}
                className={`whitespace-nowrap rounded-md px-3 py-2 ${kind === k ? "bg-brand-600 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <PendingPoller active={rows.some((r) => r.status === "pending")} />
        {rows.length === 0 ? (
          <Empty>No media yet. Generate or upload something above.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
              const src = `/api/media/${r.publicId}`;
              return (
                <Card key={r.id} className="flex flex-col overflow-hidden p-0">
                  <div className="flex aspect-video items-center justify-center bg-zinc-100">
                    {r.status === "pending" ? (
                      <div className="flex flex-col items-center gap-2 text-xs text-zinc-500">
                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800" />
                        Rendering video…
                      </div>
                    ) : r.status === "failed" ? (
                      <p className="px-4 text-center text-xs text-red-600">{r.error || "Generation failed"}</p>
                    ) : r.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={r.prompt ?? "Image"} loading="lazy" className="h-full w-full object-contain" />
                    ) : (
                      <video src={src} poster={thumbs[r.id]} controls preload={thumbs[r.id] ? "none" : "metadata"} playsInline className="h-full w-full" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <Badge tone={r.status === "ready" ? "green" : r.status === "pending" ? "amber" : "red"}>{r.kind}</Badge>
                      <span className="min-w-0 break-all">{r.source === "upload" ? "uploaded" : r.model}</span>
                      <span>·</span>
                      <LocalDate iso={r.createdAt.toISOString()} />
                      {r.status === "ready" && <span>· {fmtSize(r.sizeBytes)}</span>}
                    </div>
                    {r.prompt && <p className="line-clamp-3 text-sm text-zinc-800" title={r.prompt}>{r.prompt}</p>}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {r.status === "ready" && <CopyUrl url={`${base}${src}`} />}
                        {r.status === "ready" && r.kind === "video" && (
                          <ThumbnailButton videoId={r.id} src={src} thumbUrl={thumbs[r.id] ?? null} prompt={r.source === "generated" ? r.prompt : null} cost={CREDIT_COSTS.image_generation.cost} />
                        )}
                      </div>
                      <DeleteMedia id={r.id} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
