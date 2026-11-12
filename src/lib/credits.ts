import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditTransactions, tenants } from "@/db/schema";

// Pure module (no next/* imports) — also used by the realtime voice server.

export const FREE_CREDITS = 1000;

/** Price list, in credits. Edit here to change pricing. */
export const CREDIT_COSTS = {
  whatsapp_message: { cost: 5, label: "WhatsApp agent reply", unit: "per reply" },
  chatbot_message: { cost: 2, label: "Chatbot agent reply", unit: "per reply" },
  voice_minute: { cost: 10, label: "Voice call (inbound or outbound)", unit: "per minute" },
  whatsapp_template: { cost: 5, label: "WhatsApp campaign message", unit: "per message" },
  social_post: { cost: 2, label: "Social post", unit: "per platform" },
  ai_post_text: { cost: 1, label: "AI-written post text", unit: "per generation" },
  image_generation: { cost: 20, label: "AI image", unit: "per image" },
  video_generation: { cost: 150, label: "AI video", unit: "per video" },
} as const;

export type CreditKind = keyof typeof CREDIT_COSTS;

export async function getCredits(tenantId: string): Promise<number> {
  const [t] = await db.select({ credits: tenants.credits }).from(tenants).where(eq(tenants.id, tenantId));
  return t?.credits ?? 0;
}

/** True if the tenant can afford `units` of this action. */
export async function hasCredits(tenantId: string, kind: CreditKind, units = 1): Promise<boolean> {
  return (await getCredits(tenantId)) >= CREDIT_COSTS[kind].cost * units;
}

/**
 * Deduct credits atomically. Returns false (and charges nothing) if the balance is too low.
 * `allowNegative` is for usage that already happened (e.g. a finished call) — it always charges.
 */
export async function chargeCredits(tenantId: string, kind: CreditKind, opts: { units?: number; note?: string; allowNegative?: boolean } = {}): Promise<boolean> {
  const amount = Math.max(0, Math.ceil(CREDIT_COSTS[kind].cost * (opts.units ?? 1)));
  if (!amount) return true;
  const where = opts.allowNegative ? eq(tenants.id, tenantId) : and(eq(tenants.id, tenantId), gte(tenants.credits, amount));
  const rows = await db.update(tenants).set({ credits: sql`${tenants.credits} - ${amount}` }).where(where).returning({ id: tenants.id });
  if (!rows.length) return false;
  await db.insert(creditTransactions).values({ tenantId, amount: -amount, kind, note: opts.note ?? null });
  return true;
}

/** Add credits (refund a failed action, manual grant, future payment top-up). */
export async function addCredits(tenantId: string, amount: number, kind: string, note?: string) {
  if (amount <= 0) return;
  await db.update(tenants).set({ credits: sql`${tenants.credits} + ${amount}` }).where(eq(tenants.id, tenantId));
  await db.insert(creditTransactions).values({ tenantId, amount, kind, note: note ?? null });
}

export const OUT_OF_CREDITS = "You're out of credits. Top up in Billing to continue.";
