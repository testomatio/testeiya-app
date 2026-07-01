"use client";

import { useEffect } from "react";

/**
 * Forwards uncaught webview errors and unhandled promise rejections to the Bun
 * server (`/api/client-log`), which logs them to `~/.testeiya/testeiya.log`.
 * Without this, client-side failures only surface in the webview DevTools and
 * never reach the file logger. Uses a bare `fetch` (not the `http` helper) so a
 * logging failure can't itself trigger another rejection and loop.
 */
export function ClientErrorLogger() {
  useEffect(() => {
    function send(payload: Record<string, unknown>) {
      try {
        void fetch("/api/client-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* never let logging throw */
      }
    }

    function onError(e: ErrorEvent) {
      send({
        kind: "error",
        message: e.message,
        source: e.filename,
        line: e.lineno,
        column: e.colno,
        stack: e.error instanceof Error ? e.error.stack : undefined,
      });
    }

    function onRejection(e: PromiseRejectionEvent) {
      const reason = e.reason;
      send({
        kind: "unhandledrejection",
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
