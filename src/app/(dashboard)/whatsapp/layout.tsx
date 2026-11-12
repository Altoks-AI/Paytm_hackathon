import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { Tabs } from "./_components/tabs";

export default function WhatsAppLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <PageHeader title="WhatsApp" description="Message templates and broadcast campaigns via your Meta WhatsApp Business account." />
      <Tabs />
      {children}
    </div>
  );
}
