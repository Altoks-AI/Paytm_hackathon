# What is needed from you

The build is complete. Everything below is needed to **test and launch** it. Items are in the order they unblock things.

Put all values in a file named `.env` in the project folder (copy `.env.example` and fill it in). Never commit `.env` or share it publicly.

## 1. Required to run the app

| What | Where it goes | How to get it |
|---|---|---|
| Postgres connection string | `DATABASE_URL` | Format: `postgresql://USER:PASSWORD@HOST:5432/DBNAME`. Either use the Postgres already installed on this machine (username, password and a database name), or create a PostgreSQL service on [Railway](https://railway.com) and copy its connection URL. |

With only this, signup, onboarding and every dashboard page can be tested.

These three are random strings, not accounts. They can be generated for you; say the word.

| What | Where it goes | Note |
|---|---|---|
| Session secret | `AUTH_SECRET` | Any long random string |
| Encryption key | `ENCRYPTION_KEY` | Any long random string. Never change it after tenants have saved credentials |
| Cron secret | `CRON_SECRET` | Any long random string |

## 2. Required for the AI features

These are platform keys: set once for the whole product. Tenants never see or enter them.

| What | Where it goes | How to get it | Used for |
|---|---|---|---|
| OpenRouter API key | `OPENROUTER_API_KEY` | [openrouter.ai](https://openrouter.ai) → Keys. The account needs some credit. | Agent replies, company summary, AI post text, reading images and PDFs, image and video generation, content safety checks |
| Sarvam AI API key | `SARVAM_API_KEY` | [dashboard.sarvam.ai](https://dashboard.sarvam.ai) | Voice calls (speech-to-text and text-to-speech) and WhatsApp voice notes |

## 3. Required to test real channels

Optional for a first test. These are the credentials each tenant enters on the **Integrations** page, so you need one set of your own to try each channel. The in-app **Documentation** page has step-by-step instructions for every one.

| Channel | What you need |
|---|---|
| WhatsApp | A Meta developer app with the WhatsApp product: phone number ID, WhatsApp Business Account ID, permanent access token, app secret |
| Voice calls | A Twilio account: account SID, auth token, a voice-capable phone number |
| LinkedIn | Access token and author URN |
| X | API key, API key secret, access token, access token secret (a paid API plan is needed to post) |
| Facebook | Page ID and Page access token |
| Instagram | Instagram user ID and access token (Business or Creator account linked to a Facebook Page) |
| YouTube | OAuth client ID, client secret and refresh token |

WhatsApp and Twilio call the app over the internet, so testing them needs a public HTTPS address: either the deployed Railway URL or a tunnel to your machine. Set `APP_URL` to that address.

## 4. Required for deployment on Railway

| What | Why |
|---|---|
| A Railway project with a PostgreSQL service and an app service | Hosting |
| A volume attached to the app service, with `MEDIA_DIR` set to its mount path | Without it, generated and uploaded media is lost on every redeploy |
| `APP_URL` set to the public domain, with `https://` | Webhooks, the chat widget and media links all depend on it |
| The domain you want to use (optional) | Otherwise the Railway-provided domain is used |

Deployment steps are in `README.md`.

## 5. Decisions

| What | Current state |
|---|---|
| Product name | "AgentDesk" is a placeholder used across the app and landing page |
| Feature document | Your first message said "use this" but no file came through. Send it if you want the build checked against it |
| Credit prices | Set in `src/lib/credits.ts`. Confirm or change the numbers |
| Credit pack prices on the Billing page | Placeholders (₹499, ₹1,999, ₹6,999). Buying is disabled; there is no payment gateway yet |

## What happens once these arrive

1. Database URL: create the tables, then test signup, onboarding and every dashboard page, and fix what breaks.
2. OpenRouter and Sarvam keys: test the agent in the chat widget, AI post text, and image and video generation.
3. Meta and Twilio accounts: test a real WhatsApp conversation and a real phone call, including the realtime voice pipeline.
4. Social accounts: test a real post on each platform.
