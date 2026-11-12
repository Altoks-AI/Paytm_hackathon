// Custom Next.js server: serves the app and accepts Twilio Media Streams WebSockets on /voice-stream (realtime voice).
// Run: `tsx server.ts` (dev) / `tsx server.ts --prod` (production, after `next build`).
import { createServer } from "http";
import type { Duplex } from "stream";

async function main() {
  const dev = !process.argv.includes("--prod");
  if (!dev) (process.env as Record<string, string>).NODE_ENV = "production";
  process.env.VOICE_REALTIME = "1";

  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd(), dev);

  // Imported after env is loaded (the db client reads DATABASE_URL at import time).
  const [{ default: next }, { WebSocketServer }, { handleVoiceStream }] = await Promise.all([import("next"), import("ws"), import("./src/lib/voice/realtime")]);

  const port = parseInt(process.env.PORT || "3000", 10);
  const server = createServer();
  const app = next({ dev, port, httpServer: server });
  const handle = app.getRequestHandler();
  await app.prepare();

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });
  wss.on("connection", (ws) => handleVoiceStream(ws));
  wss.on("error", (e) => console.error("[voice-rt] wss error", e.message));

  server.on("request", (req, res) => {
    handle(req, res).catch((e) => {
      console.error("request failed", e);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });
  // Only /voice-stream is handled here. Next attaches its own "upgrade" listener to this server on the first request
  // (HMR in dev) and leaves unmatched paths like /voice-stream alone, so other upgrades must not be forwarded twice.
  server.on("upgrade", (req, socket: Duplex, head) => {
    if ((req.url || "").split("?")[0] !== "/voice-stream") return;
    socket.on("error", () => {});
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  server.listen(port, "0.0.0.0", () => console.log(`> Ready on http://localhost:${port} (${dev ? "development" : "production"}, realtime voice on /voice-stream)`));
}

process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
