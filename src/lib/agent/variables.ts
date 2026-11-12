/** Dynamic variables: `{{name}}` placeholders in an agent's instructions/greeting, filled per call or conversation. */

const VAR = /\{\{\s*([a-zA-Z][\w]{0,40})\s*\}\}/g;

/** Filled automatically from the conversation, so they are never asked for. */
export const AUTO_VARIABLES = ["customer_name", "customer_phone"];

/** Unique variable names used in the given texts, in order of first appearance. */
export function extractVariables(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const t of texts) for (const m of (t ?? "").matchAll(VAR)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Replace `{{name}}` with its value; unknown variables become empty. */
export function fillVariables(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(VAR, (_, name: string) => (values[name] ?? "").toString());
}

export const variableLabel = (name: string) => name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
