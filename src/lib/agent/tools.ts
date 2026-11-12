import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { appointments, conversations, handoffs, leads, type Channel } from "@/db/schema";
import type { ToolDef } from "@/lib/llm";
import { formatDateTime, parseLocalDateTime } from "./time";
import { callCustomTool, listCustomTools, toToolDef, type CustomTool } from "./custom-tools";

export type ToolContext = {
  tenantId: string;
  conversation: typeof conversations.$inferSelect;
  channel: Channel;
  handoff: boolean;
  ended: boolean;
  /** tenant-defined webhook tools available this turn, by name */
  custom: Map<string, CustomTool>;
};

/** Tools for this tenant: built-ins that aren't switched off + enabled custom webhook tools. */
export async function loadTools(tenantId: string, agentId: string | null, disabled: string[] = []): Promise<{ defs: ToolDef[]; custom: Map<string, CustomTool> }> {
  const builtin = agentTools.filter((t) => !disabled.includes(t.function.name));
  const rows = (agentId ? await listCustomTools(tenantId, agentId) : []).filter((t) => t.enabled && !builtin.some((b) => b.function.name === t.name));
  return { defs: [...builtin, ...rows.map(toToolDef)], custom: new Map(rows.map((t) => [t.name, t])) };
}

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolDef => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});
const str = (description: string) => ({ type: "string", description });

export const agentTools: ToolDef[] = [
  fn(
    "book_appointment",
    "Book an appointment once you have the customer's name, phone number, date/time and purpose. Confirm details with the customer first.",
    {
      name: str("Customer full name"),
      phone: str("Customer phone number with country code"),
      datetime: str("Appointment start as ISO 8601 with timezone offset, e.g. 2026-05-14T15:30:00+05:30"),
      purpose: str("Reason for the appointment"),
    },
    ["name", "phone", "datetime"]
  ),
  fn("check_appointments", "List the customer's upcoming appointments by phone number.", { phone: str("Customer phone number (optional if already known)") }),
  fn("cancel_appointment", "Cancel an appointment by its id (get ids from check_appointments).", { appointment_id: str("Appointment id") }, ["appointment_id"]),
  fn("capture_lead", "Save the customer's contact details as a lead when they share them or show buying interest.", {
    name: str("Customer name"),
    phone: str("Phone number with country code"),
    email: str("Email address"),
    notes: str("What they are interested in"),
  }),
  fn("request_handoff", "Hand the conversation to a human staff member. Use when the customer asks for a human, is upset, or you cannot help.", { reason: str("Short reason for the handoff") }, ["reason"]),
  fn("end_conversation", "Call when the conversation is clearly finished (customer said goodbye / nothing else needed).", {}),
];

export function normalizePhone(p?: string | null) {
  if (!p) return null;
  const digits = p.replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  return `+${digits}`;
}

async function upsertLead(ctx: ToolContext, data: { name?: string; phone?: string | null; email?: string; notes?: string }) {
  const { tenantId, conversation } = ctx;
  const phone = normalizePhone(data.phone) ?? normalizePhone(conversation.customerPhone);
  const fields = {
    ...(data.name ? { name: data.name } : {}),
    ...(data.email ? { email: data.email } : {}),
    ...(data.notes ? { notes: data.notes } : {}),
  };
  let leadId = conversation.leadId;
  if (leadId) {
    if (Object.keys(fields).length || phone) {
      await db.update(leads).set({ ...fields, ...(phone ? { phone } : {}) }).where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId))).catch(() => undefined);
    }
  } else if (phone) {
    const [row] = await db
      .insert(leads)
      .values({ tenantId, phone, source: ctx.channel, ...fields })
      .onConflictDoUpdate({ target: [leads.tenantId, leads.phone], set: fields.name || fields.email || fields.notes ? fields : { phone } })
      .returning({ id: leads.id });
    leadId = row.id;
  } else {
    const [row] = await db.insert(leads).values({ tenantId, source: ctx.channel, ...fields }).returning({ id: leads.id });
    leadId = row.id;
  }
  if (leadId && leadId !== conversation.leadId) {
    await db.update(conversations).set({ leadId, ...(data.name && !conversation.customerName ? { customerName: data.name } : {}) }).where(and(eq(conversations.id, conversation.id), eq(conversations.tenantId, tenantId)));
    conversation.leadId = leadId;
  }
  return leadId;
}

type Args = Record<string, string | undefined>;

export async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
  let args: Args = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return JSON.stringify({ error: "Invalid JSON arguments" });
  }
  const { tenantId, conversation } = ctx;
  const custom = ctx.custom.get(name);
  if (custom) return callCustomTool(custom, args, { channel: ctx.channel, conversationId: conversation.id, customerPhone: conversation.customerPhone });
  try {
    switch (name) {
      case "book_appointment": {
        const startsAt = parseLocalDateTime(args.datetime ?? "");
        if (!startsAt) return JSON.stringify({ error: "Invalid datetime; use ISO 8601 like 2026-05-14T15:30:00+05:30" });
        if (startsAt.getTime() < Date.now()) return JSON.stringify({ error: "That time is in the past; ask for a future time" });
        const phone = normalizePhone(args.phone) ?? normalizePhone(conversation.customerPhone);
        const leadId = await upsertLead(ctx, { name: args.name, phone });
        const [appt] = await db
          .insert(appointments)
          .values({ tenantId, leadId, customerName: args.name ?? null, customerPhone: phone, startsAt, purpose: args.purpose ?? null, channel: ctx.channel })
          .returning();
        return JSON.stringify({ ok: true, appointment_id: appt.id, when: formatDateTime(startsAt), name: appt.customerName, purpose: appt.purpose });
      }
      case "check_appointments": {
        const phone = normalizePhone(args.phone) ?? normalizePhone(conversation.customerPhone);
        if (!phone) return JSON.stringify({ error: "Need the customer's phone number" });
        const rows = await db
          .select()
          .from(appointments)
          .where(and(eq(appointments.tenantId, tenantId), eq(appointments.customerPhone, phone), eq(appointments.status, "booked"), gte(appointments.startsAt, new Date())))
          .orderBy(asc(appointments.startsAt))
          .limit(10);
        return JSON.stringify({ appointments: rows.map((a) => ({ appointment_id: a.id, when: formatDateTime(a.startsAt), purpose: a.purpose, name: a.customerName })) });
      }
      case "cancel_appointment": {
        if (!args.appointment_id || !/^[0-9a-f-]{36}$/i.test(args.appointment_id)) return JSON.stringify({ error: "Invalid appointment id" });
        const [row] = await db
          .update(appointments)
          .set({ status: "cancelled" })
          .where(and(eq(appointments.id, args.appointment_id), eq(appointments.tenantId, tenantId), eq(appointments.status, "booked")))
          .returning({ id: appointments.id });
        return JSON.stringify(row ? { ok: true } : { error: "Appointment not found or already cancelled" });
      }
      case "capture_lead": {
        await upsertLead(ctx, { name: args.name, phone: args.phone, email: args.email, notes: args.notes });
        return JSON.stringify({ ok: true });
      }
      case "request_handoff": {
        if (!ctx.handoff) {
          await db.insert(handoffs).values({ tenantId, conversationId: conversation.id, channel: ctx.channel, reason: args.reason ?? null });
          await db.update(conversations).set({ status: "handoff", updatedAt: new Date() }).where(and(eq(conversations.id, conversation.id), eq(conversations.tenantId, tenantId)));
          ctx.handoff = true;
        }
        return JSON.stringify({ ok: true, note: "A human teammate has been notified. Tell the customer briefly that someone will get back to them shortly." });
      }
      case "end_conversation": {
        ctx.ended = true;
        return JSON.stringify({ ok: true, note: "Say a brief goodbye." });
      }
      default:
        return JSON.stringify({ error: `Unknown tool ${name}` });
    }
  } catch (e) {
    console.error("agent tool error", name, e);
    return JSON.stringify({ error: "Tool failed, apologise and offer a human handoff" });
  }
}
