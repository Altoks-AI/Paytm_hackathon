import type { NextRequest } from "next/server";
import { getAudio } from "@/lib/voice/audio-cache";

/** Serves pre-generated Sarvam TTS audio by unguessable short-lived id (see lib/voice/audio-cache). */
export async function GET(req: NextRequest) {
  const audio = getAudio(req.nextUrl.searchParams.get("id") || "");
  if (!audio) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=600" } });
}
