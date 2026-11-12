/** Business timezone used for the agent's sense of "now", booking and dashboard display. */
export const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

/** e.g. "+05:30" for the business timezone at the given instant. */
export function tzOffset(d = new Date()) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "+00:00";
}

export function formatDateTime(d: Date | string) {
  return new Date(d).toLocaleString("en-IN", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
}

/** Parse an ISO-ish datetime from the LLM; if it has no offset, interpret it in the business timezone. */
export function parseLocalDateTime(s: string): Date | null {
  const v = s.trim();
  if (!v) return null;
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(v);
  const withSeconds = /T\d{2}:\d{2}$/.test(v) ? `${v}:00` : v;
  const d = new Date(hasOffset ? v : `${withSeconds}${tzOffset()}`);
  return isNaN(d.getTime()) ? null : d;
}
