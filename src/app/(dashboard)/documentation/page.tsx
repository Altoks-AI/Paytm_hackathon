import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireTenant } from "@/lib/tenant";
import { appUrl } from "@/lib/tenant-data";
import { Card, PageHeader } from "@/components/ui";

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900">
    {children}
  </a>
);
const In = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-medium text-zinc-900 underline underline-offset-2">
    {children}
  </Link>
);
const Sep = () => <ChevronRight size={14} strokeWidth={2} aria-hidden className="inline-block align-[-2px] text-zinc-400" />;
const Code = ({ children }: { children: ReactNode }) => <code className="break-all rounded bg-zinc-100 px-1.5 py-0.5 text-[13px] text-zinc-800">{children}</code>;

type Guide = { id: string; title: string; intro: ReactNode; needs?: string[]; steps: ReactNode[]; notes?: ReactNode[] };

function guides(base: string): { group: string; items: Guide[] }[] {
  return [
    {
      group: "Getting started",
      items: [
        {
          id: "quick-start",
          title: "Quick start",
          intro: "The order that gets you live fastest.",
          steps: [
            <>Check your company details and summary in <In href="/settings">Settings</In> — the agent uses this summary as its knowledge of your business.</>,
            <>Open <In href="/agent">Agent</In>: set the name, instructions, languages, voice and model, and add FAQs to the knowledge base.</>,
            <>Connect the channels you want in <In href="/integrations">Integrations</In> using the guides below.</>,
            <>Back in <In href="/agent">Agent <Sep /> Channels</In>, switch on WhatsApp, Voice and/or Chatbot.</>,
            <>Add or import your contacts in <In href="/leads">Leads</In> to run WhatsApp and call campaigns.</>,
          ],
        },
      ],
    },
    {
      group: "Agent channels",
      items: [
        {
          id: "whatsapp",
          title: "WhatsApp (Meta Cloud API)",
          intro: "Lets the agent reply on your WhatsApp Business number and lets you send template campaigns.",
          needs: ["Phone number ID", "WhatsApp Business Account ID", "Access token (permanent)", "Verify token (you choose it)", "App secret (recommended)"],
          steps: [
            <>Go to <A href="https://developers.facebook.com/apps">Meta for Developers <Sep /> My Apps</A>, click <b>Create app</b> and select the use case <b>Connect with customers through WhatsApp</b>.</>,
            <>In the app, open <b>Use cases <Sep /> Customize <Sep /> API Setup</b> and add or pick your business phone number. Copy the <b>Phone number ID</b> and the WhatsApp Business Account ID (shown as <b>Messaging account ID</b>).</>,
            <>Create a permanent token: in <A href="https://business.facebook.com/settings/">Business settings</A> open <b>System users</b>, add a system user (Admin), use <b>Assign assets</b> to give it your app and your WhatsApp account with full control, then <b>Generate token</b> with the permissions <Code>business_management</Code>, <Code>whatsapp_business_messaging</Code> and <Code>whatsapp_business_management</Code>, choosing the longest token expiration offered. The temporary token on the API Setup page expires within hours, so don&apos;t use that one.</>,
            <>Copy the <b>App secret</b> from <b>Settings <Sep /> Basic</b> in the app dashboard.</>,
            <>Make up a verify token (any random phrase). Paste all of these into <In href="/integrations">Integrations <Sep /> WhatsApp</In> and save.</>,
            <>In the Meta app, open <b>Use cases <Sep /> Customize <Sep /> Configuration</b>. Under Webhook, set Callback URL to <Code>{base}/api/webhooks/whatsapp</Code> and Verify token to the same phrase you saved, then save. Subscribe to the <Code>messages</Code> field.</>,
            <>Switch WhatsApp on in <In href="/agent">Agent <Sep /> Channels</In> and send your number a message to test.</>,
          ],
          notes: [
            <>Save the integration here <b>before</b> verifying the webhook in Meta, otherwise verification fails.</>,
            <>To message customers outside the 24-hour reply window you must use an approved template — see <a href="#wa-campaigns" className="underline">WhatsApp campaigns</a>.</>,
            <>Official guide: <A href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started">WhatsApp Cloud API — Get started</A>.</>,
          ],
        },
        {
          id: "twilio",
          title: "Voice calls (Twilio)",
          intro: "Gives the agent a phone number for inbound calls and lets you run outbound call campaigns.",
          needs: ["Account SID", "Auth token", "Twilio phone number"],
          steps: [
            <>Sign up or log in at the <A href="https://console.twilio.com">Twilio Console</A>. The <b>Account SID</b> and <b>Auth Token</b> are on the console home page under Account Info.</>,
            <>Buy a voice-capable number under <A href="https://console.twilio.com/us1/develop/phone-numbers/manage/search">Phone Numbers <Sep /> Buy a number</A>. For Indian numbers Twilio asks for regulatory documents first.</>,
            <>Paste the SID, token and number (with country code, e.g. <Code>+14155550123</Code>) into <In href="/integrations">Integrations <Sep /> Twilio</In> and save.</>,
            <>Open the number under <A href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming">Phone Numbers <Sep /> Active numbers</A>. Under <b>Voice Configuration</b> set <b>A call comes in</b> <Sep /> Webhook <Sep /> <Code>{base}/api/voice/incoming</Code> (HTTP POST), and <b>Call status changes</b> <Sep /> <Code>{base}/api/voice/status</Code> (HTTP POST). Save.</>,
            <>In <In href="/agent">Agent</In>, pick a voice and languages, set the <b>handoff phone number</b> (where calls are transferred when a customer asks for a human), and switch Voice on.</>,
            <>Call your Twilio number to test. Outbound calls and campaigns are under <In href="/calls">Call Campaigns</In>.</>,
          ],
          notes: [
            <>The status webhook is what records call duration and bills call minutes — don&apos;t skip it.</>,
            <>A Twilio trial account can only call, and take calls from, numbers you have verified (up to 5). Upgrade the account before running campaigns.</>,
            <>In Twilio&apos;s new Console the same number settings are under <b>Numbers &amp; senders</b> <Sep /> your number <Sep /> <b>Configuration details</b>.</>,
          ],
        },
        {
          id: "chatbot",
          title: "Website chatbot widget",
          intro: "The same agent as a chat bubble on your website. No external account needed.",
          steps: [
            <>Open <In href="/agent">Agent <Sep /> Widget</In>, choose a colour and copy the embed snippet.</>,
            <>Paste the snippet just before <Code>&lt;/body&gt;</Code> on every page where the chat should appear (in WordPress, Shopify, Wix or Webflow use the &quot;custom code / footer scripts&quot; setting).</>,
            <>Switch Chatbot on in <In href="/agent">Agent <Sep /> Channels</In>. Reload your site — the bubble appears bottom-right.</>,
          ],
          notes: [<>When a visitor asks for a human, the chat appears in <In href="/handoffs">Handoffs</In> and your team can reply from <In href="/conversations">Conversations</In>.</>],
        },
      ],
    },
    {
      group: "Social media posting",
      items: [
        {
          id: "linkedin",
          title: "LinkedIn",
          intro: "Post text, images and videos to a personal profile or a company page.",
          needs: ["Access token", "Author URN"],
          steps: [
            <>Create an app at <A href="https://www.linkedin.com/developers/apps">LinkedIn Developers <Sep /> My apps</A> and link it to your company page.</>,
            <>On the app&apos;s <b>Products</b> tab request <b>Share on LinkedIn</b> (posts as a person). To post as a company page, also request <b>Community Management API</b> (needs LinkedIn approval).</>,
            <>Generate a token with the <A href="https://www.linkedin.com/developers/tools/oauth/token-generator">OAuth token generator</A>: select your app and tick <Code>w_member_social</Code> (person) or <Code>w_organization_social</Code> (company page). Tick every scope you need in one token: requesting a different set invalidates your earlier tokens.</>,
            <>Author URN: for a company page use <Code>urn:li:organization:PAGE_ID</Code> — the number in your page&apos;s admin URL (<Code>linkedin.com/company/12345678/admin</Code>). For a personal profile use <Code>urn:li:person:MEMBER_ID</Code>: also add the <b>Sign In with LinkedIn using OpenID Connect</b> product, include <Code>openid</Code> and <Code>profile</Code> in the token, call <Code>GET https://api.linkedin.com/v2/userinfo</Code> with it as a Bearer token (e.g. with curl or Postman), and use the <Code>sub</Code> value as MEMBER_ID.</>,
            <>Paste both into <In href="/integrations">Integrations <Sep /> LinkedIn</In>.</>,
          ],
          notes: [
            <>LinkedIn access tokens expire after 60 days — generate a new one and save it again when posts start failing.</>,
            <>Company-page posting only works if you are an Administrator or Content admin of that page.</>,
          ],
        },
        {
          id: "twitter",
          title: "X (Twitter)",
          intro: "Post text, images and videos to your X account.",
          needs: ["API key", "API key secret", "Access token", "Access token secret"],
          steps: [
            <>Sign in at the <A href="https://console.x.com">X Developer Console</A> and create an app.</>,
            <>In the app&apos;s <b>User authentication settings</b>, set app permissions to <b>Read and write</b> and save.</>,
            <>On <b>Keys and tokens</b>, copy the <b>API Key and Secret</b>, then generate the <b>Access Token and Secret</b>. They are shown only once, so copy them straight away. If you generated them before switching to Read and write, regenerate them.</>,
            <>Paste all four into <In href="/integrations">Integrations <Sep /> X</In>.</>,
          ],
          notes: [
            <>The X API is pay-per-use: buy credits in the Developer Console before posting. Each post is charged (posts containing a link cost more), so check current prices on the <A href="https://docs.x.com/x-api/getting-started/pricing">X API pricing page</A>.</>,
            <>Posts are limited to 280 characters unless the account has X Premium.</>,
          ],
        },
        {
          id: "facebook",
          title: "Facebook Page",
          intro: "Post text, photos and videos to a Facebook Page you manage.",
          needs: ["Page ID", "Page access token"],
          steps: [
            <>Use (or create) a Meta app at <A href="https://developers.facebook.com/apps">Meta for Developers</A> with the use case <b>Manage everything on your Page</b>.</>,
            <>Open the <A href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</A>, select your app, add the permissions <Code>pages_manage_posts</Code>, <Code>pages_read_engagement</Code> and <Code>pages_show_list</Code>, then choose your Page under <b>User or Page</b> to get a <b>Page access token</b>. To set custom thumbnails on videos, also add <Code>pages_read_user_content</Code> and <Code>pages_manage_engagement</Code>.</>,
            <>Make it long-lived with the <A href="https://developers.facebook.com/tools/debug/accesstoken/">Access Token Debugger</A> <Sep /> <b>Extend Access Token</b>, then fetch the Page token again with the extended user token.</>,
            <>Page ID: on your Page go to <b>About <Sep /> Page transparency</b>, or run <Code>me/accounts</Code> in the Explorer.</>,
            <>Paste both into <In href="/integrations">Integrations <Sep /> Facebook</In>.</>,
          ],
        },
        {
          id: "instagram",
          title: "Instagram",
          intro: "Publish images and reels. Instagram does not allow text-only posts.",
          needs: ["Instagram user ID", "Access token"],
          steps: [
            <>Your Instagram account must be a <b>Business or Creator</b> account linked to a Facebook Page (Instagram app <Sep /> Settings and activity <Sep /> Account type and tools).</>,
            <>In the <A href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</A>, generate a token with <Code>instagram_basic</Code>, <Code>instagram_content_publish</Code>, <Code>pages_show_list</Code> and <Code>pages_read_engagement</Code>, and extend it as described for Facebook.</>,
            <>Find the Instagram user ID by running <Code>PAGE_ID?fields=instagram_business_account</Code> in the Explorer — use the <Code>id</Code> inside <Code>instagram_business_account</Code>.</>,
            <>Paste both into <In href="/integrations">Integrations <Sep /> Instagram</In>.</>,
          ],
          notes: [
            <>Instagram downloads the image or video from a public link, so use a file from your <In href="/media">Media Library</In> or another public URL. Images should be JPEG.</>,
            <>Official guide: <A href="https://developers.facebook.com/docs/instagram-platform/content-publishing">Instagram content publishing</A>.</>,
          ],
        },
        {
          id: "youtube",
          title: "YouTube",
          intro: "Upload videos to your channel. Only video posts are supported.",
          needs: ["Client ID", "Client secret", "Refresh token"],
          steps: [
            <>In the <A href="https://console.cloud.google.com/apis/library/youtube.googleapis.com">Google Cloud Console</A>, create a project and enable <b>YouTube Data API v3</b>.</>,
            <>Set up the OAuth consent screen under <b>Google Auth Platform</b> (<A href="https://console.developers.google.com/auth/branding">Branding</A> for app name and support email), then in <A href="https://console.developers.google.com/auth/audience">Audience <Sep /> Test users</A> add your Google account (or publish the app).</>,
            <>In <A href="https://console.developers.google.com/auth/clients">Google Auth Platform <Sep /> Clients</A> click <b>Create client</b>, choose <b>Web application</b> and add the authorized redirect URI <Code>https://developers.google.com/oauthplayground</Code>. Copy the client ID and secret straight away: Google shows the full secret only once.</>,
            <>Open the <A href="https://developers.google.com/oauthplayground">OAuth 2.0 Playground</A>, click the gear icon, tick <b>Use your own OAuth credentials</b> and enter them. Authorise the scope <Code>https://www.googleapis.com/auth/youtube.upload</Code> with the Google account that owns the channel, then <b>Exchange authorization code for tokens</b> and copy the <b>Refresh token</b>.</>,
            <>Paste all three into <In href="/integrations">Integrations <Sep /> YouTube</In>.</>,
          ],
          notes: [
            <>While the consent screen is in &quot;Testing&quot;, Google expires refresh tokens after 7 days. Publish the app to keep it working.</>,
            <>By default a Google Cloud project can upload about 100 videos per day through the API.</>,
          ],
        },
      ],
    },
    {
      group: "Using the platform",
      items: [
        {
          id: "wa-campaigns",
          title: "WhatsApp templates and campaigns",
          intro: "Send reminders, offers and updates to all your leads or a selected few.",
          steps: [
            <>In <In href="/whatsapp/templates">WhatsApp <Sep /> Templates</In>, create a template. Use <Code>{"{{1}}"}</Code>, <Code>{"{{2}}"}</Code>… for dynamic values and map each to a lead field (name, phone, email) or a custom value.</>,
            <>Click <b>Submit to Meta</b>. Approval often takes minutes but can take up to 24 hours — use <b>Sync status</b> to refresh.</>,
            <>Once approved, go to <In href="/whatsapp/campaigns">Campaigns <Sep /> New</In>, choose the template, fill in custom values, pick all leads or selected leads, and send.</>,
          ],
          notes: [<>Meta charges you directly for template messages, in addition to credits here. Templates must pass <A href="https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review">Meta&apos;s template review</A>; for example, the body must not start or end with a variable.</>],
        },
        {
          id: "custom-tools",
          title: "Custom tools (connect the agent to your systems)",
          intro: "Let the agent call your own API — check an order, look up stock, create a ticket.",
          steps: [
            <>Open <In href="/agent">Agent <Sep /> Tools</In> and add a tool.</>,
            <>Give it a clear name and a description of <b>when</b> the agent should use it, e.g. &quot;Look up the status of an order when the customer gives an order number&quot;.</>,
            <>Enter the HTTP method and a public URL. Use <Code>{"{param}"}</Code> in the URL for path values, e.g. <Code>https://api.yourshop.com/orders/{"{order_id}"}</Code>.</>,
            <>Add the parameters the agent must collect, and any headers such as <Code>Authorization</Code> (stored encrypted).</>,
            <>Your endpoint should answer within 10 seconds with JSON or plain text. The agent reads the response and replies to the customer.</>,
          ],
          notes: [
            <>Each request includes <Code>X-Agent-Channel</Code>, <Code>X-Conversation-Id</Code> and, when known, <Code>X-Customer-Phone</Code> headers.</>,
            <>Built-in tools (book appointment, capture lead, human handoff, end call) can be switched on or off on the same tab.</>,
          ],
        },
        {
          id: "credits",
          title: "Credits",
          intro: "Usage is paid for with credits. Every new account starts with 1,000 free credits.",
          steps: [
            <>See your balance, the price of each action and your usage history in <In href="/billing">Billing &amp; Credits</In>.</>,
            <>When the balance reaches zero the agent stops replying and campaigns pause until credits are added.</>,
          ],
        },
      ],
    },
  ];
}

export default async function DocumentationPage() {
  await requireTenant();
  const groups = guides(appUrl());

  return (
    <>
      <PageHeader title="Documentation" description="Step-by-step setup guides: where to get each credential and where to paste it." />
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav className="top-6 hidden self-start text-sm lg:sticky lg:block">
          {groups.map((g) => (
            <div key={g.group} className="mb-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">{g.group}</p>
              {g.items.map((i) => (
                <a key={i.id} href={`#${i.id}`} className="block rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
                  {i.title}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="min-w-0 space-y-10">
          {groups.map((g) => (
            <section key={g.group}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{g.group}</h2>
              <div className="space-y-4">
                {g.items.map((i) => (
                  <Card key={i.id} id={i.id} className="scroll-mt-6">
                    <h3 className="text-base font-semibold text-zinc-900">{i.title}</h3>
                    <p className="mt-1 text-sm text-zinc-500">{i.intro}</p>
                    {i.needs && (
                      <p className="mt-3 text-sm text-zinc-700">
                        <span className="font-medium">You&apos;ll need:</span> {i.needs.join(" · ")}
                      </p>
                    )}
                    <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-zinc-700 marker:font-medium marker:text-zinc-400">
                      {i.steps.map((s, n) => (
                        <li key={n}>{s}</li>
                      ))}
                    </ol>
                    {i.notes && (
                      <ul className="mt-4 space-y-1.5 rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
                        {i.notes.map((s, n) => (
                          <li key={n}>{s}</li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
