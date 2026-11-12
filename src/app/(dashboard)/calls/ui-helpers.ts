export function statusTone(s: string): "zinc" | "green" | "amber" | "red" | "blue" {
  if (["completed"].includes(s)) return "green";
  if (["running", "in-progress", "sent", "ringing", "queued"].includes(s)) return "blue";
  if (["failed", "busy", "no-answer", "canceled", "voicemail"].includes(s)) return "red";
  if (["paused", "pending"].includes(s)) return "amber";
  return "zinc";
}

export function fmtDuration(sec: number | null) {
  if (sec == null) return "—";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
