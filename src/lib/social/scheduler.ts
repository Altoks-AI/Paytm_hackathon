import { publishDuePosts } from "./index";

const g = globalThis as unknown as { __socialScheduler?: ReturnType<typeof setInterval>; __socialTickRunning?: boolean };

/** In-process fallback scheduler for long-lived Node servers (Railway). Idempotent. */
export function ensureScheduler() {
  if (g.__socialScheduler || process.env.NEXT_PHASE === "phase-production-build" || process.env.SOCIAL_SCHEDULER === "off") return;
  const tick = async () => {
    if (g.__socialTickRunning) return;
    g.__socialTickRunning = true;
    try {
      await publishDuePosts();
    } catch (e) {
      console.error("[social scheduler]", e);
    } finally {
      g.__socialTickRunning = false;
    }
  };
  g.__socialScheduler = setInterval(tick, 60_000);
  g.__socialScheduler.unref?.();
  void tick();
}
