import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, tenants } from "@/db/schema";

/** Signed-in user row (tenantId may be null before onboarding). Redirects to /login if signed out. */
export async function requireUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) redirect("/login");
  return user;
}

/** For dashboard pages / server actions: returns { user, tenant, tenantId }. Redirects to /onboarding if not onboarded. */
export async function requireTenant() {
  const user = await requireUser();
  if (!user.tenantId) redirect("/onboarding");
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId));
  if (!tenant || !tenant.onboarded) redirect("/onboarding");
  return { user, tenant, tenantId: tenant.id };
}

/** For API route handlers: returns tenantId or null (respond 401 yourself). */
export async function getTenantId(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const [user] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.email, email));
  return user?.tenantId ?? null;
}

export { getAgentSettings, getTenant, appUrl } from "./tenant-data";
