import type { Provider } from "@/db/schema";

export type FieldDef = { key: string; label: string; hint: string; secret?: boolean; optional?: boolean };
export type ProviderDef = { id: Provider; name: string; description: string; fields: FieldDef[] };

/** Field lists mirror ProviderConfig in src/lib/integrations.ts. */
export const PROVIDERS: ProviderDef[] = [
  {
    id: "meta_whatsapp",
    name: "Meta WhatsApp",
    description: "WhatsApp Cloud API: every number in your Business Account can be given to one agent.",
    fields: [
      { key: "phoneNumberId", label: "Default phone number ID", hint: "Meta developer app → API Setup → Phone number ID. Every number in this WhatsApp Business Account can be assigned to an agent." },
      { key: "wabaId", label: "WhatsApp Business Account ID", hint: "Same API Setup page → WhatsApp Business Account ID (shown as Messaging account ID)" },
      { key: "accessToken", label: "Access token", secret: true, hint: "Business settings → System users → Generate token (business_management, whatsapp_business_messaging, whatsapp_business_management)" },
      { key: "verifyToken", label: "Webhook verify token", hint: "Any string you choose (auto-generated if blank); paste it in Meta's webhook settings" },
      { key: "appSecret", label: "App secret", secret: true, optional: true, hint: "App dashboard → Settings → Basic → App secret; used to verify webhook signatures" },
    ],
  },
  {
    id: "twilio",
    name: "Twilio Voice",
    description: "AI phone calls: every number on your Twilio account can be given to one agent.",
    fields: [
      { key: "accountSid", label: "Account SID", hint: "Twilio Console home → Account Info → Account SID (starts with AC)" },
      { key: "authToken", label: "Auth token", secret: true, hint: "Twilio Console home → Account Info → Auth Token" },
      { key: "phoneNumber", label: "Default phone number", hint: "Used by agents without a number of their own. All numbers on the account can be assigned to agents. E.g. +14155550123" },
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Publish posts to a LinkedIn profile or company page.",
    fields: [
      { key: "accessToken", label: "Access token", secret: true, hint: "LinkedIn OAuth token generator → your app → w_member_social (profile) or w_organization_social (page); expires after 60 days" },
      { key: "authorUrn", label: "Author URN", hint: "urn:li:person:<sub from /v2/userinfo> or urn:li:organization:<page id>" },
    ],
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    description: "Publish posts to your X account.",
    fields: [
      { key: "apiKey", label: "API key", secret: true, hint: "console.x.com → your app → Keys and tokens → API Key" },
      { key: "apiSecret", label: "API secret", secret: true, hint: "Same page → API Key Secret" },
      { key: "accessToken", label: "Access token", secret: true, hint: "Keys and tokens → Access Token (app permission: Read and write)" },
      { key: "accessSecret", label: "Access token secret", secret: true, hint: "Shown together with the Access Token" },
    ],
  },
  {
    id: "facebook",
    name: "Facebook Page",
    description: "Publish posts to a Facebook Page.",
    fields: [
      { key: "pageId", label: "Page ID", hint: "Your Page → About → Page transparency, or Meta Business Suite → Settings" },
      { key: "pageAccessToken", label: "Page access token", secret: true, hint: "Graph API Explorer → Get Page Access Token (pages_manage_posts); use a long-lived token" },
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Publish images and reels to an Instagram business account.",
    fields: [
      { key: "igUserId", label: "Instagram user ID", hint: "Graph API: GET /{page-id}?fields=instagram_business_account → id" },
      { key: "accessToken", label: "Access token", secret: true, hint: "Long-lived token with instagram_basic + instagram_content_publish (Facebook Login), or instagram_business_basic + instagram_business_content_publish (Instagram Login)" },
    ],
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Upload videos to your YouTube channel.",
    fields: [
      { key: "clientId", label: "OAuth client ID", hint: "Google Cloud Console → Google Auth Platform → Clients → Web application client ID" },
      { key: "clientSecret", label: "OAuth client secret", secret: true, hint: "Shown in full only once, when you create the client" },
      { key: "refreshToken", label: "Refresh token", secret: true, hint: "Google OAuth Playground with your client + youtube.upload scope → Refresh token" },
    ],
  },
];

export const getProviderDef = (id: string) => PROVIDERS.find((p) => p.id === id);
