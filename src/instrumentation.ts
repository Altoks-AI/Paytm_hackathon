// Runs once when the Node server boots (Railway): start the in-process scheduler for due social posts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    const { ensureScheduler } = await import("@/lib/social/scheduler");
    ensureScheduler();
  }
}
