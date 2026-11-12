# AgentDesk

A multi-tenant platform that gives each company one AI agent for its customers on WhatsApp, phone calls and a website chat widget, plus outbound WhatsApp and call campaigns, social media posting, and AI image/video generation.

"AgentDesk" is a placeholder name.

> **Status: MVP, not yet tested end to end.** The project builds, typechecks and lints cleanly, and the landing and signup pages have been checked in a browser. Nothing has been run against a real database, a live WhatsApp/Twilio/Sarvam account, a social platform or a paid generation call. Expect to fix things on the first real run.

## Contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Deploying on Railway](#deploying-on-railway)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Routes](#routes)
- [Database](#database)
- [Credits and billing](#credits-and-billing)
- [Guardrails](#guardrails)
- [Design system](#design-system)
- [Known gaps](#known-gaps)

## What it does

**Who uses it.** A *tenant* is a company. Its staff sign up, describe the company, connect their own provider accounts and configure the agent. The people who talk to the agent are that company's *customers*.

**The agent (inbound).** One agent serves three channels with the same model, tools, knowledge and instructions. Only a short channel note in the prompt differs.

| Channel | How customers reach it | Notes |
|---|---|---|
| WhatsApp | The tenant's WhatsApp Business number (Meta Cloud API) | Reads text, voice notes (Sarvam STT), images and PDFs (vision LLM), locations |
| Voice | The tenant's Twilio number | Realtime streaming with barge-in; falls back to a turn-based loop |
| Chatbot | A `<script>` widget pasted into the tenant's website | Staff replies appear in the same window after a handoff |

Each channel has its own on/off switch.

**What the agent can do.**
- Answer from the company summary and a knowledge base of FAQs
- Book, check and cancel appointments
- Save contact details as leads
- Hand off to a human: calls are transferred to a phone number, chats are flagged in the dashboard
- End the call or conversation
- Call the tenant's own HTTP endpoints through custom tools

**Everything about the agent is configurable** on the Agent page: name, instructions, greeting, default and additional languages, Sarvam voice, LLM model (live list from OpenRouter) and temperature, which built-in tools are on, custom webhook tools, knowledge base, channel switches, widget colour.

**Outreach (outbound).**
- **WhatsApp campaigns**: create a template with `{{1}}`-style variables mapped to lead fields, submit it to Meta, then send to all leads or a selection
- **Call campaigns**: give the agent an objective and it calls all leads or a selection
- **Social posts**: publish text, image or video posts to LinkedIn, X, Facebook, Instagram and YouTube, now or scheduled, with optional AI-written post text
- **Media library**: generate images and videos with a chosen model, upload files, reuse them in posts

**Also included**: leads with CSV import/export, a conversations inbox with staff takeover, handoffs queue, appointments list, credits with a usage ledger, an in-app Documentation page with provider setup guides, and a public landing page.

## Tech stack

| Area | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript, run through a custom Node server (`server.ts`) |
| Styling | Tailwind CSS v4, `lucide-react` icons |
| Database | PostgreSQL with Drizzle ORM |
| Auth | Auth.js (next-auth v5) with email + password, JWT sessions, bcrypt hashes |
| LLM | OpenRouter (chat, vision, image and video generation) |
| Speech | Sarvam AI (speech-to-text and text-to-speech, REST and streaming) |
| Telephony | Twilio (webhooks, Media Streams, REST) |
| WhatsApp | Meta WhatsApp Cloud API |
| Hosting | Railway (app + Postgres + a volume for media) |

> Next.js 16 has breaking changes from earlier versions. See `AGENTS.md` and the docs bundled in `node_modules/next/dist/docs/` before changing framework-level code.

## Getting started

Requirements: Node.js 22+, a PostgreSQL database.

```bash
npm install
cp .env.example .env      # then fill it in (see below)
npm run db:push           # creates all tables from src/db/schema.ts
npm run dev               # http://localhost:3000
```

Then open `/signup`, create an account, and complete onboarding.

| Script | What it does |
|---|---|
| `npm run dev` | Development server (custom server + Next dev) |
| `npm run build` | Production build |
| `npm start` | Production server (run `build` first) |
| `npm run db:push` | Apply the schema to the database |
| `npm run lint` | ESLint |

Webhooks from Meta and Twilio need a public HTTPS URL. For local testing, use a tunnel and set `APP_URL` to the tunnel address.

## Environment variables

Required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_URL` | Public base URL of the app. Used for webhook URLs, the widget snippet, media links and Twilio signature checks, so it must match the address providers call |
| `AUTH_SECRET` | Session signing secret. Any long random string |
| `ENCRYPTION_KEY` | Encrypts tenant credentials at rest. Any long random string. **Never change it once tenants have saved credentials**, or they can no longer be decrypted |
| `OPENROUTER_API_KEY` | Platform key for all LLM, vision, image and video calls |
| `SARVAM_API_KEY` | Platform key for speech-to-text and text-to-speech |
| `CRON_SECRET` | Bearer token that protects `/api/cron/*` |

Optional:

| Variable | Default | Purpose |
|---|---|---|
| `OPENROUTER_MODEL` | `openai/gpt-4o-mini` | Model used when a tenant hasn't chosen one, and for summaries and safety checks |
| `OPENROUTER_VISION_MODEL` | `google/gemini-2.5-flash` | Reads images and PDFs sent on WhatsApp |
| `MEDIA_DIR` | `./.media` | Where generated and uploaded media is stored. Point it at a persistent volume in production |
| `VOICE_MODE` | realtime | Set to `turn` to force the turn-based voice loop |
| `SARVAM_STT_STREAM_MODEL`, `SARVAM_TTS_STREAM_CODEC` | built-in | Overrides for the streaming voice pipeline |
| `APP_TIMEZONE` | `Asia/Kolkata` | Timezone the agent uses for dates and bookings |
| `META_GRAPH_VERSION` | `v25.0` | Graph API version for WhatsApp, Facebook and Instagram |
| `LINKEDIN_VERSION` | `202609` | LinkedIn API version |
| `PORT` | `3000` | Server port |

Tenant credentials (Meta, Twilio, LinkedIn, X, Facebook, Instagram, YouTube) are **not** environment variables. Each tenant enters them on the Integrations page and they are stored encrypted in the database.

## Deploying on Railway

1. Create a project with a **PostgreSQL** service and an app service from this repository.
2. Add a **volume** to the app service and set `MEDIA_DIR` to its mount path. Without it, media files are lost on every redeploy.
3. Set the environment variables above. `APP_URL` is the public Railway domain (or your own domain) with `https://`.
4. Build command: `npm run build`. Start command: `npm start`.
5. Run `npm run db:push` once against the production database, and again after any schema change.
6. Run **one instance only**. Voice audio, rate limits, message de-duplication and the post scheduler are held in memory.

Scheduled social posts are published by an in-process scheduler that starts with the server. `/api/cron/social` does the same job on demand if you prefer an external cron (send `Authorization: Bearer <CRON_SECRET>`).

## How it works

### Multi-tenancy

One database. Every table carries `tenant_id`, and every query filters on it.

- Dashboard pages and server actions get the tenant from the session with `requireTenant()`; API routes use `getTenantId()`. A tenant id sent by the browser is never trusted.
- Public entry points resolve the tenant on the server: WhatsApp by `phone_number_id`, Twilio by the called number, the widget by its public widget key.

### Onboarding

Signup creates a user. Onboarding collects company name, industry, size, location, contact details and website, then fetches the website, has the LLM write a short summary, and stores it as the agent's company context. It also creates the tenant's agent settings and grants the free starting credits.

### The agent

`runAgent()` in `src/lib/agent/run.ts` is the single entry point for every channel. It builds the system prompt from, in order: agent name, company details and summary, the tenant's instructions, the knowledge base, the current date and time, a channel note, behaviour rules, and platform guardrails. It then runs an LLM tool loop and saves the messages.

`runAgentStream()` in `src/lib/agent/stream.ts` is the streaming version used by realtime voice. It emits sentence-sized chunks as the model produces them.

**Tools.** Built-in tools live in `src/lib/agent/tools.ts` and can each be switched off per tenant. Custom tools (`src/lib/agent/custom-tools.ts`) are tenant-defined HTTP endpoints: a name, a description of when to use it, method, URL with optional `{param}` placeholders, encrypted headers and typed parameters. Requests time out after 10 seconds, and private network addresses are refused.

**Languages.** The agent starts in the tenant's default language and switches only to the additional languages the tenant has allowed. On calls, the caller's language is detected and the reply is spoken in it.

### Voice

Two paths share the same Twilio webhooks:

- **Realtime (default).** `server.ts` accepts a WebSocket on `/voice-stream`. Twilio Media Streams audio goes to Sarvam streaming speech-to-text, the transcript goes to the streaming LLM, and each sentence goes to Sarvam text-to-speech and back to the caller. If the caller starts speaking, playback is cleared and the reply in progress is cancelled.
- **Turn-based (fallback).** Plain webhooks: play a reply, record the caller, transcribe, run the agent, repeat.

On a handoff the live call is transferred to the tenant's handoff number. Outbound calls are placed with `startOutboundCall()`; the agent opens the call using the campaign objective. Every Twilio webhook is checked against the tenant's auth token.

### WhatsApp

`/api/webhooks/whatsapp` handles Meta's verification handshake, validates the payload signature when the tenant has saved an app secret, routes by phone number id, and replies through the Cloud API. Delivery status events update campaign recipients. Media is downloaded from Meta and turned into text for the agent by `src/lib/whatsapp-media.ts`.

### Chatbot widget

`public/widget.js` is a dependency-free script that renders a chat bubble in a shadow DOM. It talks to `/api/widget/config`, `/api/widget/chat` and `/api/widget/messages`. Embed it with:

```html
<script src="https://YOUR_APP_URL/widget.js" data-key="WIDGET_KEY" async></script>
```

The exact snippet, with the tenant's key filled in, is shown on the Agent page.

### Social posting and media

Each platform has a module in `src/lib/social/` with a single `post()` function. `publishPost()` posts to the selected platforms in parallel and records a result per platform; a retry only re-posts to the platforms that failed.

**Adding media to a post.** The composer offers three equal options: upload a file, generate an image with AI from a description, or choose from the library. Pasting a public link is still possible. Video generation takes minutes, so it is started from the Media library and picked from the library when ready.

**Title, description and thumbnail.** Every post has a description (the post text). Video posts also have an optional title, required for YouTube, and an optional thumbnail. "Write with AI" fills the description, and for video posts the title as well; both stay editable.

**Video thumbnails.** A library video can have a cover image, set in three ways: pick a frame from the video (captured in the browser, no ffmpeg), upload an image, or generate one with AI. The thumbnail is itself an image in the tenant's library. When publishing, the title and thumbnail are applied where the platform's API supports them, and a thumbnail that cannot be applied is recorded as a note without failing the post:

| Platform | Title | Custom thumbnail |
|---|---|---|
| YouTube | Yes | Yes (the channel may need to be verified) |
| Facebook Page video | Yes | Yes (needs two extra token permissions, listed in Documentation) |
| LinkedIn video | Yes | Yes |
| Instagram Reels | No | Yes, as the cover image (JPEG) |
| X | No | No |

Generated and uploaded media is stored on disk under `MEDIA_DIR` and served from `/api/media/{publicId}`. That URL is public by design, because Instagram and Facebook fetch media by URL; the id is long and random. Image generation is synchronous. Video generation is an asynchronous job that is polled until the file is ready.

## Project structure

```
server.ts                     Custom server: Next.js + the /voice-stream WebSocket
public/widget.js              Embeddable chatbot widget
src/
  auth.ts                     Auth.js config and createUser()
  instrumentation.ts          Starts the social post scheduler on boot
  db/
    schema.ts                 All tables
    index.ts                  Drizzle client
  lib/
    tenant.ts                 requireUser / requireTenant / getTenantId (uses the session)
    tenant-data.ts            Tenant lookups with no Next.js imports (safe for server.ts)
    integrations.ts           Encrypted tenant credentials, webhook routing lookups
    crypto.ts                 AES-256-GCM helpers
    llm.ts                    OpenRouter chat, streaming chat, one-shot completion
    credits.ts                Price list, balance, charge and refund
    guardrails.ts             Agent guardrail prompt, generation safety check
    company.ts                Website fetch + company summary
    conversations.ts          getOrCreateConversation()
    whatsapp.ts               Send text and template messages
    whatsapp-media.ts         Voice notes, images and PDFs to text
    wa-templates.ts           Template variables and Meta template API
    wa-campaigns.ts           Broadcast runner
    leads.ts                  Phone normalisation, CSV parsing
    sarvam.ts                 Speech-to-text and text-to-speech
    agent/                    run.ts, stream.ts, tools.ts, custom-tools.ts, types.ts
    voice/                    twiml.ts, session.ts, outbound.ts, realtime.ts, stream-token.ts
    social/                   One file per platform, publishing, scheduler
    media/                    storage.ts, generate.ts
  components/
    ui.tsx                    Shared UI components
    shell.tsx                 Dashboard frame with the mobile menu
    nav.tsx                   Sidebar navigation
  app/
    page.tsx                  Landing page
    login/, signup/           Auth pages
    onboarding/               Company setup
    (dashboard)/              All signed-in pages (see Routes)
    api/                      Webhooks, widget, voice, media, cron
```

## Routes

Pages:

| Path | Purpose |
|---|---|
| `/` | Landing page |
| `/login`, `/signup` | Authentication |
| `/onboarding` | Company details and website summary |
| `/dashboard` | Overview and setup checklist |
| `/conversations`, `/conversations/[id]` | Inbox, transcripts, staff reply and takeover |
| `/handoffs` | Conversations waiting for a person |
| `/appointments` | Bookings made by the agent |
| `/leads` | Leads, CSV import and export |
| `/whatsapp/templates`, `/whatsapp/campaigns` | Templates and broadcasts |
| `/calls` | Call log and call campaigns |
| `/social` | Compose, schedule and track posts |
| `/media` | Media library and generation |
| `/agent` | Agent configuration |
| `/integrations` | Provider credentials and webhook URLs |
| `/settings` | Company details and summary |
| `/billing` | Credit balance, prices, usage history |
| `/documentation` | Setup guides for each provider |

API:

| Path | Called by |
|---|---|
| `/api/auth/[...nextauth]` | Auth.js |
| `/api/webhooks/whatsapp` | Meta |
| `/api/voice/incoming`, `/turn`, `/outbound-answer`, `/status`, `/tts` | Twilio |
| `/voice-stream` (WebSocket) | Twilio Media Streams |
| `/api/widget/config`, `/chat`, `/messages` | The widget |
| `/api/media`, `/api/media/[publicId]` | Uploads; public media serving |
| `/api/leads/export` | CSV download |
| `/api/cron/social` | External cron (optional) |

Webhook URLs to paste at the providers (also shown on the Integrations page):

- WhatsApp: `{APP_URL}/api/webhooks/whatsapp`
- Twilio voice: `{APP_URL}/api/voice/incoming` (POST)
- Twilio call status: `{APP_URL}/api/voice/status` (POST)

## Database

Defined in `src/db/schema.ts`. There are no migration files; `npm run db:push` syncs the database to the schema.

| Table | Holds |
|---|---|
| `tenants` | Company profile, summary, credit balance |
| `users` | Login accounts, linked to a tenant |
| `integrations` | Encrypted provider credentials per tenant |
| `agent_settings` | Agent configuration and channel switches |
| `agent_tools` | Custom webhook tools |
| `knowledge_items` | FAQ entries |
| `leads` | Contacts |
| `conversations`, `messages` | Chats and call transcripts on every channel |
| `handoffs` | Requests for a human |
| `appointments` | Bookings |
| `wa_templates` | WhatsApp templates and their Meta status |
| `campaigns`, `campaign_recipients` | WhatsApp and call campaigns |
| `calls` | Call log |
| `social_posts` | Posts (title, description, media and thumbnail links) and per-platform results |
| `media_files` | Media library entries; a video's `thumbnail_id` points at an image in the same library |
| `credit_transactions` | Credit ledger |

## Credits and billing

Usage is paid for with credits. New tenants get 1,000 free. Prices are defined in one place, `CREDIT_COSTS` in `src/lib/credits.ts`:

| Action | Credits |
|---|---|
| WhatsApp agent reply | 5 per reply |
| Chatbot agent reply | 2 per reply |
| Voice call | 10 per started minute |
| WhatsApp campaign message | 5 per message |
| Social post | 2 per platform |
| AI-written post text | 1 per generation |
| AI image | 20 per image |
| AI video | 150 per video |

When the balance runs out, the agent stops replying, calls are declined and campaigns stop. Failed sends, posts and generations are refunded. Every change is written to `credit_transactions`.

The Billing page is a placeholder: it shows the balance, prices and history, and its "Buy" buttons are disabled. There is no payment gateway. To add credits, call `addCredits()` or update the tenant's balance directly.

## Guardrails

Defined in `src/lib/guardrails.ts`.

- **Agent.** A fixed block is appended to every agent prompt and cannot be overridden by the tenant's instructions. It keeps the agent on the company's business, blocks abusive or harmful replies and unsupported promises, and tells it to treat customer content (including text inside images, PDFs and tool results) as information rather than instructions.
- **Generation.** Image, video and post-text requests are checked by an LLM safety review before any credits are charged. If the check cannot run, nothing is generated. Image and video prompts also get a professional, brand-safe style instruction.
- **Not covered.** Uploaded media and post text typed by hand are not screened.

## Design system

- One typeface, Hanken Grotesk.
- A green-grey neutral scale that replaces Tailwind's `zinc`, and one bottle-green brand colour (`brand-*`). Tokens are in `src/app/globals.css`.
- No gradients and no decorative shadows. Hierarchy comes from type weight, spacing and hairline borders.
- Icons only (`lucide-react`), no emojis.
- Shared components are in `src/components/ui.tsx`; change them there rather than restyling individual pages.
- Mobile first: the sidebar becomes a slide-out menu below the `lg` breakpoint.

## Known gaps

- **Untested end to end**, as described at the top.
- **Provider code is checked against documentation, not against live accounts.** The Sarvam, OpenRouter, WhatsApp, Facebook, Instagram, Twilio, LinkedIn, X and YouTube code was reviewed against each provider's official documentation and corrected where it differed. None of it has been run against a real account.
- **Some Documentation page details could not be confirmed** from public docs: a few console button and menu labels (Twilio "Call status changes", X "User authentication settings" and "Keys and tokens", Meta's token "Extend" button, finding a Facebook Page ID under Page transparency), whether LinkedIn's Community Management API needs approval, and the Google OAuth Playground steps. Click through each guide once when connecting a real account.
- **Instagram host selection is an assumption.** Tokens starting with `IG` are sent to `graph.instagram.com`, others to `graph.facebook.com`; this rule was not confirmed in the docs.
- **Twilio webhooks are set by hand** by each tenant. The status webhook is what bills call minutes, so an inbound number without it is not charged.
- **Single instance only**, because of in-memory state.
- **A post interrupted by a server crash** stays in the "posting" state.
- **Long voice notes** on WhatsApp may fail to transcribe, because the standard Sarvam endpoint is used; the agent then asks the customer to type the message.
- **Silence and time-limit prompts** on calls are in English only.
- **No password reset, email verification or team invitations.** One user per company in practice.
- **No automated tests.**
