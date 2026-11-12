import { randomBytes } from "crypto";
import { db } from "@/db";
import { agentSettings } from "@/db/schema";

export const newWidgetKey = () => `wk_${randomBytes(16).toString("hex")}`;

/** Create the tenant's agent_settings row with defaults if it doesn't exist yet. */
export async function ensureAgentSettings(tenantId: string) {
  await db.insert(agentSettings).values({ tenantId, widgetKey: newWidgetKey() }).onConflictDoNothing();
}
