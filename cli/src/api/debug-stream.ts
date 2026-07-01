import { recentDebugEntries, subscribeDebug } from "../debug-bus.js";

/*
 * SSE feed for the sidebar Debug panel: `GET /api/debug/stream`. On connect it
 * replays the recent server-side Testomat.io requests (the ring buffer) and then
 * pushes new ones live. A heartbeat keeps the connection under the server's
 * idleTimeout so idle streams aren't reset.
 */

const HEARTBEAT_MS = 25000;

export function debugStream(): Response {
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
      };
      const send = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          cleanup();
        }
      };
      for (const entry of recentDebugEntries()) {
        send(`data: ${JSON.stringify(entry)}\n\n`);
      }
      unsubscribe = subscribeDebug((entry) =>
        send(`data: ${JSON.stringify(entry)}\n\n`)
      );
      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
