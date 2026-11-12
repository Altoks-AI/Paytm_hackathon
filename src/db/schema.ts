import { pgTable, uuid, text, boolean, timestamp, jsonb, integer, real, uniqueIndex, index, type AnyPgColumn } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const tenantId = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  industry: text("industry"),
  size: text("size"),
  location: text("location"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  companySummary: text("company_summary"), // LLM summary of website + details, passed to agent
  onboarded: boolean("onboarded").notNull().default(false),
  credits: integer("credits").notNull().default(1000), // free starting balance; see lib/credits
  createdAt: createdAt(),
});

/** Ledger of every credit change (negative = usage, positive = top-up/grant). */
export const creditTransactions = pgTable("credit_transactions", {
  id: id(),
  tenantId: tenantId(),
  amount: integer("amount").notNull(),
  kind: text("kind").notNull(), // key of CREDIT_COSTS, or "grant" / "topup"
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("credit_tx_tenant").on(t.tenantId, t.createdAt)]);

/** Per-tenant media library: generated or uploaded images/videos. Bytes live on disk under MEDIA_DIR. */
export const mediaFiles = pgTable("media_files", {
  id: id(),
  tenantId: tenantId(),
  publicId: text("public_id").notNull().unique(), // unguessable id used in the public URL /api/media/{publicId}
  kind: text("kind").$type<"image" | "video">().notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  source: text("source").notNull().default("generated"), // generated | upload
  prompt: text("prompt"),
  model: text("model"),
  status: text("status").notNull().default("ready"), // pending (video still rendering) | ready | failed
  jobId: text("job_id"), // provider job id for async video generation
  error: text("error"),
  thumbnailId: uuid("thumbnail_id").references((): AnyPgColumn => mediaFiles.id, { onDelete: "set null" }), // videos: cover image, another (image) row of the same tenant
  createdAt: createdAt(),
}, (t) => [index("media_tenant").on(t.tenantId, t.createdAt)]);

export const users = pgTable("users", {
  id: id(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // null until onboarding
  email: text("email").notNull().unique(), // stored lowercase
  passwordHash: text("password_hash").notNull(), // bcryptjs
  name: text("name"),
  role: text("role").notNull().default("owner"),
  createdAt: createdAt(),
});

export type Provider =
  | "meta_whatsapp" // { phoneNumberId, wabaId, accessToken, verifyToken, appSecret }
  | "twilio" // { accountSid, authToken, phoneNumber }
  | "linkedin" // { accessToken, authorUrn }
  | "twitter" // { apiKey, apiSecret, accessToken, accessSecret }
  | "facebook" // { pageId, pageAccessToken }
  | "instagram" // { igUserId, accessToken }
  | "youtube"; // { clientId, clientSecret, refreshToken }

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    tenantId: tenantId(),
    provider: text("provider").$type<Provider>().notNull(),
    configEncrypted: text("config_encrypted").notNull(), // AES-GCM JSON, see lib/crypto
    lookupKey: text("lookup_key"), // plaintext routing key for webhooks: WA phoneNumberId / Twilio phone number (E.164)
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("integrations_tenant_provider").on(t.tenantId, t.provider), index("integrations_lookup").on(t.provider, t.lookupKey)]
);

/** A tenant can run several agents. Each has its own persona, voice, tools, knowledge, widget and (optionally) one Twilio number. */
export const agents = pgTable("agents", {
  id: id(),
  tenantId: tenantId(),
  agentName: text("agent_name").notNull().default("Assistant"),
  basePrompt: text("base_prompt").notNull().default(""), // custom instructions, shared by all channels
  model: text("model").notNull().default("openai/gpt-4o-mini"), // OpenRouter model id
  temperature: real("temperature").notNull().default(0.4),
  language: text("language").notNull().default("te-IN"), // default language
  extraLanguages: jsonb("extra_languages").$type<string[]>().notNull().default(["hi-IN", "en-IN"]), // optional languages the agent may switch to
  disabledTools: jsonb("disabled_tools").$type<string[]>().notNull().default([]), // built-in tool names switched off (see BUILTIN_TOOLS)
  voice: text("voice").notNull().default("kavitha_te_conversation"), // Sarvam TTS speaker
  greeting: text("greeting").notNull().default("Hi! How can I help you today?"),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false), // at most one agent per tenant answers WhatsApp
  voiceEnabled: boolean("voice_enabled").notNull().default(false),
  chatbotEnabled: boolean("chatbot_enabled").notNull().default(false),
  phoneNumber: text("phone_number").unique(), // Twilio number (E.164) assigned to this agent: inbound calls to it reach this agent, outbound calls come from it
  handoffPhone: text("handoff_phone"), // human number calls are transferred to
  widgetKey: text("widget_key").notNull().unique(), // public key used by the embeddable chatbot widget
  widgetColor: text("widget_color").notNull().default("#0f5b48"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("agents_tenant").on(t.tenantId, t.createdAt)]);

/** Back-compat alias: code that read the single agent's settings now reads an agent row. */
export const agentSettings = agents;
export type Agent = typeof agents.$inferSelect;

/** LEGACY single-agent table (one row per tenant). Kept only so existing rows can be migrated into `agents`; see lib/agents.ts. */
export const legacyAgentSettings = pgTable("agent_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  agentName: text("agent_name").notNull().default("Assistant"),
  basePrompt: text("base_prompt").notNull().default(""), // tenant's custom instructions, shared by all channels
  model: text("model").notNull().default("openai/gpt-4o-mini"), // OpenRouter model id
  temperature: real("temperature").notNull().default(0.4),
  language: text("language").notNull().default("en-IN"), // default language
  extraLanguages: jsonb("extra_languages").$type<string[]>().notNull().default([]), // optional languages the agent may switch to
  disabledTools: jsonb("disabled_tools").$type<string[]>().notNull().default([]), // built-in tool names switched off (see BUILTIN_TOOLS)
  voice: text("voice").notNull().default("anushka"), // Sarvam TTS speaker
  greeting: text("greeting").notNull().default("Hi! How can I help you today?"),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  voiceEnabled: boolean("voice_enabled").notNull().default(false),
  chatbotEnabled: boolean("chatbot_enabled").notNull().default(false),
  handoffPhone: text("handoff_phone"), // human number calls are transferred to
  widgetKey: text("widget_key").notNull().unique(), // public key used by the embeddable chatbot widget
  widgetColor: text("widget_color").notNull().default("#0f5b48"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ToolParam = { name: string; type: "string" | "number" | "boolean"; description: string; required: boolean };

/** Tenant-defined webhook tools: the agent calls the tenant's HTTP endpoint. */
export const agentTools = pgTable("agent_tools", {
  id: id(),
  tenantId: tenantId(),
  agentId: uuid("agent_id").references((): AnyPgColumn => agents.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // snake_case function name shown to the LLM
  description: text("description").notNull(), // tells the LLM when to call it
  method: text("method").notNull().default("POST"), // GET | POST | PUT | PATCH | DELETE
  url: text("url").notNull(), // may contain {param} path placeholders
  headersEncrypted: text("headers_encrypted"), // encryptJson(Record<string,string>) e.g. Authorization
  parameters: jsonb("parameters").$type<ToolParam[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("agent_tools_agent_name").on(t.agentId, t.name)]);

export const knowledgeItems = pgTable("knowledge_items", {
  id: id(),
  tenantId: tenantId(),
  agentId: uuid("agent_id").references((): AnyPgColumn => agents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: createdAt(),
}, (t) => [index("knowledge_tenant").on(t.tenantId)]);

export const leads = pgTable("leads", {
  id: id(),
  tenantId: tenantId(),
  name: text("name"),
  phone: text("phone"), // E.164
  email: text("email"),
  source: text("source").notNull().default("manual"), // manual | import | whatsapp | voice | chatbot
  status: text("status").notNull().default("new"), // new | contacted | qualified | converted | lost
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [index("leads_tenant").on(t.tenantId), uniqueIndex("leads_tenant_phone").on(t.tenantId, t.phone)]);

export type Channel = "whatsapp" | "voice" | "chatbot";

export const conversations = pgTable("conversations", {
  id: id(),
  tenantId: tenantId(),
  agentId: uuid("agent_id").references((): AnyPgColumn => agents.id, { onDelete: "set null" }),
  channel: text("channel").$type<Channel>().notNull(),
  externalId: text("external_id").notNull(), // customer phone (whatsapp/voice: callSid) or chatbot session id
  customerPhone: text("customer_phone"),
  customerName: text("customer_name"),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  status: text("status").notNull().default("open"), // open | handoff | closed  (handoff => agent stops replying)
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("conversations_tenant").on(t.tenantId, t.channel, t.externalId)]);

export const messages = pgTable("messages", {
  id: id(),
  tenantId: tenantId(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant | human (dashboard staff) | system
  content: text("content").notNull(),
  createdAt: createdAt(),
}, (t) => [index("messages_conversation").on(t.conversationId, t.createdAt)]);

export const handoffs = pgTable("handoffs", {
  id: id(),
  tenantId: tenantId(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  channel: text("channel").$type<Channel>().notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | resolved
  createdAt: createdAt(),
}, (t) => [index("handoffs_tenant").on(t.tenantId, t.status)]);

export const appointments = pgTable("appointments", {
  id: id(),
  tenantId: tenantId(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  purpose: text("purpose"),
  status: text("status").notNull().default("booked"), // booked | cancelled | done
  channel: text("channel"),
  createdAt: createdAt(),
}, (t) => [index("appointments_tenant").on(t.tenantId, t.startsAt)]);

export const waTemplates = pgTable("wa_templates", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(), // meta template name (lowercase_underscore)
  language: text("language").notNull().default("en"),
  category: text("category").notNull().default("MARKETING"), // MARKETING | UTILITY
  body: text("body").notNull(), // with {{1}}, {{2}} variables
  variables: jsonb("variables").$type<string[]>().notNull().default([]), // per {{n}}: "lead.name" | "lead.phone" | "lead.email" | "custom:<label>"
  metaStatus: text("meta_status").notNull().default("draft"), // draft | PENDING | APPROVED | REJECTED
  metaTemplateId: text("meta_template_id"),
  createdAt: createdAt(),
}, (t) => [index("wa_templates_tenant").on(t.tenantId)]);

export const campaigns = pgTable("campaigns", {
  id: id(),
  tenantId: tenantId(),
  agentId: uuid("agent_id").references((): AnyPgColumn => agents.id, { onDelete: "set null" }),
  type: text("type").$type<"whatsapp" | "call">().notNull(),
  name: text("name").notNull(),
  templateId: uuid("template_id").references(() => waTemplates.id, { onDelete: "set null" }), // whatsapp
  customValues: jsonb("custom_values").$type<Record<string, string>>().notNull().default({}), // values for "custom:<label>" vars
  callObjective: text("call_objective"), // call: what the outbound agent should achieve
  audience: text("audience").notNull().default("all"), // all | selected
  status: text("status").notNull().default("draft"), // draft | running | completed | failed
  createdAt: createdAt(),
}, (t) => [index("campaigns_tenant").on(t.tenantId, t.type)]);

export const campaignRecipients = pgTable("campaign_recipients", {
  id: id(),
  tenantId: tenantId(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | sent | delivered | failed | completed
  externalId: text("external_id"), // WA message id / Twilio call sid
  error: text("error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("recipients_campaign").on(t.campaignId, t.status)]);

export const calls = pgTable("calls", {
  id: id(),
  tenantId: tenantId(),
  agentId: uuid("agent_id").references((): AnyPgColumn => agents.id, { onDelete: "set null" }),
  callSid: text("call_sid").notNull().unique(),
  direction: text("direction").notNull(), // inbound | outbound
  fromNumber: text("from_number"),
  toNumber: text("to_number"),
  status: text("status").notNull().default("in-progress"),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  objective: text("objective"),
  durationSec: integer("duration_sec"),
  recordingSid: text("recording_sid"),
  recordingUrl: text("recording_url"), // Twilio recording resource URL (append .mp3); played via /api/calls/{id}/recording
  recordingDurationSec: integer("recording_duration_sec"),
  createdAt: createdAt(),
}, (t) => [index("calls_tenant").on(t.tenantId)]);

export const socialPosts = pgTable("social_posts", {
  id: id(),
  tenantId: tenantId(),
  title: text("title"), // video posts: YouTube title, Facebook video title, LinkedIn media title
  content: text("content").notNull(), // post text, or the description that goes with the image/video
  mediaUrl: text("media_url"), // public URL of image/video
  mediaType: text("media_type").notNull().default("text"), // text | image | video
  thumbnailUrl: text("thumbnail_url"), // video posts: public URL of the cover image
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]), // linkedin | twitter | instagram | facebook | youtube
  status: text("status").notNull().default("draft"), // draft | scheduled | posting | posted | failed
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  results: jsonb("results").$type<Record<string, { ok: boolean; id?: string; error?: string; note?: string }>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("social_tenant").on(t.tenantId, t.status)]);
