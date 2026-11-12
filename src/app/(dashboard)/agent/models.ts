import type { ModelOption } from "./options";

// The OpenRouter catalogue is several MB (too big for the fetch data cache), so keep a trimmed copy in memory for an hour.
let cache: { at: number; models: ModelOption[] } | null = null;
const TTL = 3600_000;

type Raw = { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] };

const perMillion = (v?: string) => {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 100) / 100 : null;
};

/** Tool-capable OpenRouter models, or null if the catalogue can't be fetched. */
export async function getToolModels(): Promise<ModelOption[] | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.models;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const { data } = (await res.json()) as { data: Raw[] };
    const models = data
      .filter((m) => m.id && m.supported_parameters?.includes("tools"))
      .map((m) => ({ id: m.id, name: m.name || m.id, context: m.context_length ?? 0, prompt: perMillion(m.pricing?.prompt), completion: perMillion(m.pricing?.completion) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!models.length) throw new Error("empty");
    cache = { at: Date.now(), models };
    return models;
  } catch {
    return cache?.models ?? null;
  }
}
