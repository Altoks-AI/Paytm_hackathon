import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { handoffs } from "@/db/schema";
import { requireTenant } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { Shell } from "@/components/shell";
import { logout } from "../login/actions";

async function Sidebar() {
  const { tenant, tenantId, user } = await requireTenant();
  const [{ n }] = await db.select({ n: count() }).from(handoffs).where(and(eq(handoffs.tenantId, tenantId), eq(handoffs.status, "pending")));
  const low = tenant.credits <= 50;
  return (
    <>
      <div className="px-2.5 pb-5 pr-10 lg:pr-2.5">
        <p className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-zinc-900">{tenant.name}</p>
        <p className="truncate text-xs text-zinc-500">{user.email}</p>
      </div>
      <Nav pendingHandoffs={n} />
      <div className="mt-auto pt-6">
        <Link href="/billing" className="block rounded-md border border-zinc-200 bg-white px-3 py-2.5 transition-colors hover:border-zinc-300">
          <span className="block text-xs text-zinc-500">Credits left</span>
          <span className={`block text-lg font-semibold tabular-nums tracking-[-0.01em] ${low ? "text-red-700" : "text-zinc-900"}`}>{tenant.credits.toLocaleString("en-IN")}</span>
          {low && <span className="block text-xs text-red-700">Running low</span>}
        </Link>
        <form action={logout} className="mt-2">
          <button type="submit" className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Shell
      sidebar={
        <Suspense fallback={<Nav />}>
          <Sidebar />
        </Suspense>
      }
    >
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>{children}</Suspense>
    </Shell>
  );
}
