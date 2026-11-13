import { Suspense } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { socialPosts } from "@/db/schema";
import { getIntegration } from "@/lib/integrations";
import { PLATFORM_LABEL, PLATFORMS, isPlatform, type Platform } from "@/lib/social/platforms";
import { ensureScheduler } from "@/lib/social/scheduler";
import { requireTenant } from "@/lib/tenant";
import { CREDIT_COSTS } from "@/lib/credits";
import { Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { deletePost, retryPost } from "./actions";
import { AutoRefresh, Composer, LocalTime } from "./composer";

const tone = { draft: "zinc", scheduled: "blue", posting: "amber", posted: "green", failed: "red" } as const;

export default function SocialPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Social media" description="Compose, schedule and publish posts to LinkedIn, X, Facebook, Instagram and YouTube." />
      <Suspense fallback={<div className="text-sm text-zinc-500">Loading…</div>}>
        <SocialContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SocialContent({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { tenantId, tenant } = await requireTenant();
  ensureScheduler();
  const { edit } = await searchParams;

  const [posts, connectedList] = await Promise.all([
    db.select().from(socialPosts).where(eq(socialPosts.tenantId, tenantId)).orderBy(desc(socialPosts.createdAt)).limit(100),
    Promise.all(PLATFORMS.map(async (p) => [p, !!(await getIntegration(tenantId, p).catch(() => null))] as const)),
  ]);
  const connected = Object.fromEntries(connectedList) as Record<Platform, boolean>;

  let editing = null;
  if (edit && /^[0-9a-f-]{36}$/i.test(edit)) {
    const [row] = await db.select().from(socialPosts).where(and(eq(socialPosts.id, edit), eq(socialPosts.tenantId, tenantId)));
    if (row && (row.status === "draft" || row.status === "scheduled")) editing = row;
  }

  return (
    <div className="space-y-8">
      <Composer
        key={editing?.id ?? "new"}
        connected={connected}
        imageCost={CREDIT_COSTS.image_generation.cost}
        videoCost={CREDIT_COSTS.video_generation.cost}
        credits={tenant.credits}
        hasContext={!!tenant.companySummary}
        initial={
          editing
            ? {
                id: editing.id,
                title: editing.title ?? "",
                thumbnailUrl: editing.thumbnailUrl ?? "",
                content: editing.content,
                mediaType: editing.mediaType,
                mediaUrl: editing.mediaUrl ?? "",
                platforms: editing.platforms,
                scheduledAt: editing.scheduledAt?.toISOString() ?? null,
              }
            : null
        }
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Posts</h2>
        <AutoRefresh active={posts.some((p) => p.status === "posting")} />
        {posts.length === 0 ? (
          <Empty>No posts yet. Compose your first one above.</Empty>
        ) : (
          <div className="space-y-3">
            {posts.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <Badge tone={tone[p.status as keyof typeof tone] ?? "zinc"}>{p.status}</Badge>
                      <span>{p.mediaType}</span>
                      <span>·</span>
                      <span>{p.platforms.map((x) => (isPlatform(x) ? PLATFORM_LABEL[x] : x)).join(", ") || "no platforms"}</span>
                      <span>·</span>
                      {p.status === "scheduled" && p.scheduledAt ? (
                        <span>
                          for <LocalTime iso={p.scheduledAt.toISOString()} />
                        </span>
                      ) : (
                        <LocalTime iso={p.createdAt.toISOString()} />
                      )}
                    </div>
                    {p.title && <p className="mb-0.5 text-sm font-semibold text-zinc-900 [overflow-wrap:anywhere]">{p.title}</p>}
                    <p className="line-clamp-3 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm text-zinc-800">{p.content || <em className="text-zinc-400">(no text)</em>}</p>
                    {p.mediaUrl && (
                      <a href={p.mediaUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-zinc-500 underline">
                        {p.mediaUrl}
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {(p.status === "draft" || p.status === "scheduled") && (
                      <Link href={`/social?edit=${p.id}`} className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
                        Edit
                      </Link>
                    )}
                    {p.status === "failed" && (
                      <form action={retryPost.bind(null, p.id)}>
                        <Button variant="secondary">Retry</Button>
                      </form>
                    )}
                    {p.status !== "posting" && (
                      <form action={deletePost.bind(null, p.id)}>
                        <Button variant="ghost" className="text-red-600">
                          Delete
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
                {Object.keys(p.results).length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-xs">
                    {Object.entries(p.results).map(([platform, r]) => (
                      <li key={platform} className="flex gap-2">
                        <span className={`mt-px shrink-0 ${r.ok ? "text-emerald-600" : "text-red-600"}`}>{r.ok ? <Check size={14} strokeWidth={2} aria-label="Posted" /> : <X size={14} strokeWidth={2} aria-label="Failed" />}</span>
                        <span className="shrink-0 font-medium text-zinc-700">{isPlatform(platform) ? PLATFORM_LABEL[platform] : platform}</span>
                        <span className="min-w-0 [overflow-wrap:anywhere] text-zinc-500">{r.ok ? (r.id ? `Posted (id ${r.id})` : "Posted") : r.error}{r.ok && r.note ? ` Note: ${r.note}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
