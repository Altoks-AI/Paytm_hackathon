"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { deleteMedia, refreshMedia } from "./actions";

/** While videos render: poll the provider every 6s via a server action and refresh the page when something finishes. */
export function PendingPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const left = await refreshMedia().catch(() => -1);
      if (stop) return;
      if (left === 0) router.refresh();
      else timer = setTimeout(tick, 6000);
    };
    timer = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [active, router]);
  return null;
}

export function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-8 px-2.5 text-xs"
      onClick={() => navigator.clipboard.writeText(url).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
      title={url}
    >
      {copied ? "Copied!" : "Copy public URL"}
    </Button>
  );
}

export function DeleteMedia({ id }: { id: string }) {
  const [busy, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-8 px-2.5 text-xs text-red-600"
      disabled={busy}
      onClick={() => confirm("Delete this file? Posts already using its URL will lose the media.") && start(() => deleteMedia(id))}
    >
      {busy ? "Deleting…" : "Delete"}
    </Button>
  );
}

export function LocalDate({ iso }: { iso: string }) {
  return <time suppressHydrationWarning dateTime={iso}>{new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>;
}
