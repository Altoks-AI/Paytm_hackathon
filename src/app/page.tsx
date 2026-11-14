import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  CalendarCheck,
  ChevronDown,
  FileText,
  Headset,
  Image as ImageIcon,
  Languages,
  MessageCircle,
  MessagesSquare,
  Phone,
  PhoneOutgoing,
  Plug,
  Send,
  Share2,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { CREDIT_COSTS, FREE_CREDITS } from "@/lib/credits";

async function RedirectIfSignedIn() {
  const session = await auth();
  if (session?.user?.email) redirect("/dashboard");
  return null;
}

// A real exchange, shown the way it appears in the product's conversation view.
const transcript: { who: "customer" | "agent"; text: string }[] = [
  { who: "customer", text: "Hi, is the clinic open on Saturday? I need a dental check-up." },
  { who: "agent", text: "Yes, we're open Saturday 9 am to 2 pm. I have 10:30 and 12:15 free. Which works for you?" },
  { who: "customer", text: "10:30. It's for Priya Nair." },
  { who: "agent", text: "Booked, Priya. Saturday at 10:30 am for a dental check-up. We'll send a reminder the evening before." },
];

const channels: { icon: LucideIcon; title: string; body: string; points: string[] }[] = [
  {
    icon: MessageCircle,
    title: "WhatsApp",
    body: "Replies on your own WhatsApp Business number, in WhatsApp's own formatting.",
    points: ["Understands voice notes, photos and PDFs", "Your team can take over any chat", "Works with your existing Meta account"],
  },
  {
    icon: Phone,
    title: "Phone calls",
    body: "Picks up your business line and talks naturally, with no menus to press through.",
    points: ["Callers can interrupt mid-sentence", "Transfers to a person on request", "Choose the voice your callers hear"],
  },
  {
    icon: MessagesSquare,
    title: "Website chat",
    body: "A chat window on your site, added by pasting one line of code.",
    points: ["Matches your brand colour", "Staff replies appear in the same window", "Works on any website builder"],
  },
];

const moreChannels: { title: string; body: string }[] = [
  { title: "Instagram", body: "DMs and comments" },
  { title: "Facebook", body: "Messenger and comments" },
  { title: "X (Twitter)", body: "DMs and replies" },
  { title: "LinkedIn", body: "Messages and comments" },
  { title: "YouTube", body: "Comments and replies" },
  { title: "Email", body: "Inbox and outreach" },
];

const abilities: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: CalendarCheck, title: "Books appointments", body: "Offers times, confirms the booking, and lets customers check or cancel later." },
  { icon: UserPlus, title: "Saves every lead", body: "Names, numbers and what each person asked about go straight into your leads list." },
  { icon: Headset, title: "Hands over to your team", body: "When someone asks for a person, calls are transferred and chats land in your inbox with the full history." },
  { icon: Plug, title: "Connects to your systems", body: "Give it your own API and it can check an order, look up stock or raise a ticket." },
  { icon: Languages, title: "Speaks your customers' language", body: "English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi and Odia." },
  { icon: ShieldCheck, title: "Stays on your business", body: "Answers only from your company details and FAQs, and declines anything unrelated or inappropriate." },
];

const outreach: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Send, title: "WhatsApp campaigns", body: "Build a message template with each customer's name in it, get it approved, and send to all your leads or a chosen few." },
  { icon: PhoneOutgoing, title: "Call campaigns", body: "Give the agent a goal, such as confirming a visit or qualifying a lead, and it calls your list and records every outcome." },
  { icon: Share2, title: "Social posts", body: "Write once and publish to LinkedIn, Instagram, Facebook, X and YouTube, now or on a schedule." },
  { icon: ImageIcon, title: "Images and video", body: "Generate professional visuals for your posts and keep them in your own media library." },
];

const steps = [
  { title: "Create your account", body: "Sign up with your email. It takes under a minute." },
  { title: "Tell us about your company", body: "Add your details and website. We read it and brief the agent on your business." },
  { title: "Connect your channels", body: "Link WhatsApp, your phone number and social accounts with step-by-step guides." },
  { title: "Switch the agent on", body: "Turn on each channel when you're ready and watch conversations come in." },
];

const faqs = [
  {
    q: "Do I need technical skills to set this up?",
    a: "No. You fill in your company details, paste a few keys from your WhatsApp and phone provider, and switch the channels on. The documentation walks through each provider screen by screen.",
  },
  {
    q: "Will the agent make things up?",
    a: "It answers from the company details and FAQs you provide. When it doesn't know, it says so and offers to connect the customer with your team.",
  },
  {
    q: "Can my team step in during a conversation?",
    a: "Yes. Any chat can be taken over from the dashboard, and phone calls are transferred to the number you choose.",
  },
  {
    q: "Which accounts do I need?",
    a: "A WhatsApp Business account from Meta for WhatsApp, and a Twilio number for calls. The website chat needs nothing extra. Social posting uses your own pages and profiles.",
  },
  {
    q: "How do credits work?",
    a: `Every action has a fixed credit price, shown below. New accounts start with ${FREE_CREDITS.toLocaleString("en-IN")} free credits.`,
  },
];

function Icon({ icon: I }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 bg-white text-brand-600">
      <I size={20} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function SectionHead({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-[40rem]">
      <h2 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-zinc-900 sm:text-[2.25rem]">{title}</h2>
      <p className="mt-3 text-base leading-relaxed text-zinc-600 sm:text-lg">{body}</p>
    </div>
  );
}

const wrap = "mx-auto w-full max-w-[1120px] px-5 sm:px-6";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>

      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
        <div className={`${wrap} flex items-center justify-between py-3.5`}>
          <span className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-zinc-900">AgentDesk</span>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#features" className="hidden rounded-md px-3 py-2 text-zinc-600 transition-colors hover:text-zinc-900 md:block">
              Features
            </a>
            <a href="#how-it-works" className="hidden rounded-md px-3 py-2 text-zinc-600 transition-colors hover:text-zinc-900 md:block">
              How it works
            </a>
            <a href="#pricing" className="hidden rounded-md px-3 py-2 text-zinc-600 transition-colors hover:text-zinc-900 md:block">
              Pricing
            </a>
            <Link href="/login" className="rounded-md px-3 py-2 text-zinc-600 transition-colors hover:text-zinc-900">
              Log in
            </Link>
            <Link href="/signup" className="rounded-md bg-brand-600 px-3.5 py-2 font-medium text-white transition-colors hover:bg-brand-700">
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className={`${wrap} grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-24`}>
          <div>
            <h1 className="text-[2.125rem] font-semibold leading-[1.1] tracking-[-0.035em] text-zinc-900 sm:text-[2.75rem] lg:text-[3.5rem] lg:leading-[1.06]">
              One unified agent for customer engagement and marketing.
            </h1>
            <p className="mt-5 max-w-[34rem] text-base leading-relaxed text-zinc-600 sm:mt-6 sm:text-lg">
              Build your agent once and assign it to every channel. It answers customers, books and takes orders, posts on social media and runs WhatsApp and voice campaigns, and hands over to your team when a person is needed.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/signup" className="rounded-md bg-brand-600 px-5 py-3 text-center text-[0.9375rem] font-medium text-white transition-colors hover:bg-brand-700">
                Create account
              </Link>
              <span className="text-sm text-zinc-500">{FREE_CREDITS.toLocaleString("en-IN")} free credits. No card needed.</span>
            </div>
          </div>

          <div className="rounded-[14px] border border-zinc-200 bg-zinc-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-[0.8125rem]">
              <span className="font-medium text-zinc-900">+91 98470 12345</span>
              <span className="text-zinc-500">WhatsApp, today 6:42 pm</span>
            </div>
            <div className="space-y-2.5 rounded-[10px] border border-zinc-200 bg-white p-3 sm:p-4">
              {transcript.map((m, i) => (
                <div key={i} className={`flex ${m.who === "agent" ? "justify-end" : "justify-start"}`}>
                  <p className={`max-w-[88%] rounded-lg px-3.5 py-2.5 text-[0.9375rem] leading-snug ${m.who === "agent" ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-900"}`}>{m.text}</p>
                </div>
              ))}
              <p className="flex items-start gap-2 border-t border-zinc-100 pt-3 text-[0.8125rem] text-zinc-500">
                <CalendarCheck size={15} strokeWidth={1.75} className="mt-px shrink-0 text-brand-600" aria-hidden />
                Appointment booked for Sat 16 Nov, 10:30 am. Lead saved as Priya Nair.
              </p>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-16 border-t border-zinc-200 bg-zinc-50">
          <div className={`${wrap} py-14 sm:py-20`}>
            <SectionHead title="One agent, every channel" body="Build it once and assign it wherever your customers talk. Nothing is rebuilt per channel." />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {channels.map((c) => (
                <div key={c.title} className="rounded-[10px] border border-zinc-200 bg-white p-6">
                  <Icon icon={c.icon} />
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em] text-zinc-900">{c.title}</h3>
                  <p className="mt-2 leading-relaxed text-zinc-600">{c.body}</p>
                  <ul className="mt-5 space-y-2.5 border-t border-zinc-100 pt-5 text-[0.9375rem] text-zinc-700">
                    {c.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
              {moreChannels.map((c) => (
                <div key={c.title} className="rounded-[10px] border border-zinc-200 bg-white px-5 py-4 sm:px-6">
                  <h3 className="font-semibold tracking-[-0.01em] text-zinc-900">{c.title}</h3>
                  <p className="mt-1 text-[0.9375rem] text-zinc-600">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${wrap} py-14 sm:py-20`}>
          <SectionHead title="What the agent does for your customers" body="More than answering questions. It finishes the job, and knows when to bring in a person." />
          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {abilities.map((a) => (
              <div key={a.title} className="flex gap-4">
                <div className="shrink-0">
                  <Icon icon={a.icon} />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900">{a.title}</h3>
                  <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-zinc-600">{a.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-10 flex items-start gap-3 rounded-[10px] border border-zinc-200 bg-zinc-50 p-4 text-[0.9375rem] leading-relaxed text-zinc-700">
            <FileText size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
            Customers can send a voice note, a photo of a bill or a PDF on WhatsApp. The agent listens to it or reads it, then replies.
          </p>
        </section>

        <section className="border-t border-zinc-200 bg-zinc-50">
          <div className={`${wrap} py-14 sm:py-20`}>
            <SectionHead title="Digital marketing built in" body="The same agent posts on social media and runs campaigns over WhatsApp and voice. Replies come straight back to it as conversations." />
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {outreach.map((o) => (
                <div key={o.title} className="flex gap-4 rounded-[10px] border border-zinc-200 bg-white p-5 sm:p-6">
                  <div className="shrink-0">
                    <Icon icon={o.icon} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900">{o.title}</h3>
                    <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-zinc-600">{o.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className={`${wrap} scroll-mt-16 py-14 sm:py-20`}>
          <SectionHead title="Live in an afternoon" body="Four steps from signing up to your first answered customer." />
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="border-t-2 border-brand-600 pt-5">
                <span className="text-sm font-semibold tabular-nums text-brand-600">Step {i + 1}</span>
                <h3 className="mt-2 font-semibold text-zinc-900">{s.title}</h3>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-zinc-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="pricing" className="scroll-mt-16 border-t border-zinc-200 bg-zinc-50">
          <div className={`${wrap} grid gap-10 py-14 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16`}>
            <div>
              <SectionHead title="Pay for what you use" body="No plans or seats. Each action costs a fixed number of credits, and you only spend them when the agent works for you." />
              <p className="mt-6 text-[0.9375rem] leading-relaxed text-zinc-600">
                Every new account starts with <span className="font-semibold text-zinc-900">{FREE_CREDITS.toLocaleString("en-IN")} free credits</span>, enough to try every channel.
              </p>
              <Link href="/signup" className="mt-7 inline-block rounded-md bg-brand-600 px-5 py-3 text-[0.9375rem] font-medium text-white transition-colors hover:bg-brand-700">
                Start with free credits
              </Link>
            </div>
            <div className="overflow-hidden rounded-[10px] border border-zinc-200 bg-white">
              <table className="w-full text-left text-[0.9375rem]">
                <thead className="border-b border-zinc-200 text-[0.8125rem] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium sm:px-5">Action</th>
                    <th className="px-4 py-3 text-right font-medium sm:px-5">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {Object.entries(CREDIT_COSTS).map(([k, v]) => (
                    <tr key={k}>
                      <td className="px-4 py-3 text-zinc-800 sm:px-5">{v.label}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right sm:px-5">
                        <span className="font-semibold text-zinc-900">{v.cost}</span> <span className="text-zinc-500">{v.unit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={`${wrap} py-14 sm:py-20`}>
          <SectionHead title="Questions" body="The things companies usually ask before they start." />
          <div className="mt-8 max-w-[46rem] divide-y divide-zinc-200 border-y border-zinc-200">
            {faqs.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium text-zinc-900 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown size={18} strokeWidth={1.75} className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="pb-5 pr-8 leading-relaxed text-zinc-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-brand-700">
          <div className={`${wrap} flex flex-col items-start gap-6 py-14 sm:py-16 lg:flex-row lg:items-center lg:justify-between`}>
            <h2 className="max-w-[36rem] text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[2.25rem]">Build the agent once. Assign it to every channel.</h2>
            <Link href="/signup" className="w-full rounded-md bg-white px-6 py-3 text-center text-[0.9375rem] font-medium text-brand-700 transition-colors hover:bg-brand-50 sm:w-auto">
              Create account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200">
        <div className={`${wrap} flex flex-col gap-3 py-6 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between`}>
          <span className="font-semibold tracking-[-0.01em] text-zinc-900">AgentDesk</span>
          <div className="flex gap-5">
            <a href="#features" className="transition-colors hover:text-zinc-900">
              Features
            </a>
            <a href="#pricing" className="transition-colors hover:text-zinc-900">
              Pricing
            </a>
            <Link href="/login" className="transition-colors hover:text-zinc-900">
              Log in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
