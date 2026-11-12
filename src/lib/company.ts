import { complete } from "@/lib/llm";

export type CompanyDetails = { name: string; industry?: string | null; size?: string | null; location?: string | null; website?: string | null };

const MAX_CHARS = 15_000;
const TIMEOUT_MS = 8_000;

/** Normalize a user-entered website into an absolute http(s) URL, or null. */
export function normalizeWebsite(raw?: string | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Refuse obvious internal hosts so tenants can't make us fetch private network resources. */
function isPublicHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") || h === "::1" || h === "0.0.0.0") return false;
  const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return false;
  }
  return !/^(fc|fd|fe80)/.test(h);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    if (!isPublicHost(new URL(url).hostname)) return null;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CompanyProfileBot/1.0)", Accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    return (await res.text()).slice(0, 500_000);
  } catch {
    return null;
  }
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
      }
      return entities[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Pick up to `max` same-origin links that look like about/services/contact pages. */
function pickLinks(html: string, base: URL, max = 2) {
  const wanted = /about|company|service|product|contact|pricing|hours|who-we-are|what-we-do/i;
  const out: string[] = [];
  for (const m of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      u.hash = "";
      if (u.origin !== base.origin || !wanted.test(u.pathname) || u.pathname === base.pathname) continue;
      const s = u.toString();
      if (!out.includes(s)) out.push(s);
      if (out.length >= max) break;
    } catch {}
  }
  return out;
}

/** Fetch homepage + a couple of relevant same-origin pages as plain text (capped). Never throws. */
export async function scrapeWebsite(website?: string | null): Promise<string> {
  const url = normalizeWebsite(website);
  if (!url) return "";
  const home = await fetchHtml(url);
  if (!home) return "";
  const extra = await Promise.all(pickLinks(home, new URL(url)).map(fetchHtml));
  const parts = [htmlToText(home), ...extra.filter((h): h is string => !!h).map(htmlToText)];
  return parts.join("\n\n---\n\n").slice(0, MAX_CHARS);
}

const detailLines = (c: CompanyDetails) =>
  [`Company: ${c.name}`, c.industry && `Industry: ${c.industry}`, c.size && `Size: ${c.size}`, c.location && `Location: ${c.location}`, c.website && `Website: ${c.website}`]
    .filter(Boolean)
    .join("\n");

/** Plain fallback summary built from the form details only. */
export function basicSummary(c: CompanyDetails) {
  return `${c.name}${c.industry ? ` is a ${c.industry} company` : ""}${c.location ? ` based in ${c.location}` : ""}.${c.website ? ` Website: ${c.website}.` : ""}`;
}

/** Scrape the company website (best effort) and have the LLM write a ~150-200 word company context for the AI agent. Throws if the LLM call fails. */
export async function summarizeCompany(c: CompanyDetails): Promise<string> {
  const site = await scrapeWebsite(c.website);
  const system =
    "You write concise company profiles that an AI customer-support agent will use as background context. " +
    "Write 150-200 words of plain prose (no markdown headings, no bullet symbols). Cover: what the company does, its main products/services, " +
    "who it serves, and any business hours, address, phone, email or booking info found. Only state facts present in the input; never invent details.";
  const user = `${detailLines(c)}\n\nWebsite content:\n${site || "(website unavailable — rely on the details above)"}`;
  const out = await complete(system, user, { maxTokens: 500 });
  return out || basicSummary(c);
}
