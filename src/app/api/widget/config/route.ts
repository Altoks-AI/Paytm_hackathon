import { json, preflight, settingsByKey } from "../shared";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  const s = await settingsByKey(new URL(req.url).searchParams.get("key"));
  if (!s) return json({ enabled: false, error: "Unknown widget key" }, 404);
  return json({ agentName: s.agentName, greeting: s.greeting, color: s.widgetColor, enabled: s.chatbotEnabled });
}
