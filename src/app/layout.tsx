import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "AgentDesk", template: "%s | AgentDesk" },
  description: "One AI agent for your customers on WhatsApp, voice and chat.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hanken.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
