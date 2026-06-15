/*
 * Instrumentation for outbound Testomat.io calls made from the UI (proxied via
 * `/api/testomatio/*`). `loggedFetch` wraps `fetch`, captures the request body +
 * response, always prints a truncated line to the console, and forwards a
 * structured entry to a registered sink (the DebugLogService → Debug panel).
 */

const MAX_BODY = 2000;

let sink: Sink | null = null;
let seq = 0;

export function setExternalLogSink(next: Sink | null): void {
  sink = next;
}

export async function loggedFetch(
  url: string,
  init?: RequestInit
): Promise<{ res: Response; text: string }> {
  const method = (init?.method ?? "GET").toUpperCase();
  const requestBody = readRequestBody(init?.body);
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    record({
      method,
      url,
      requestBody,
      status: res.status,
      ok: res.ok,
      responseBody: text,
      error: null,
      durationMs: Date.now() - started,
    });
    return { res, text };
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    record({
      method,
      url,
      requestBody,
      status: null,
      ok: false,
      responseBody: null,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    });
    throw e;
  }
}

function record(partial: Omit<ExternalLogEntry, "id" | "ts">): void {
  seq += 1;
  const entry: ExternalLogEntry = { id: seq, ts: Date.now(), ...partial };
  logToConsole(entry);
  if (sink) sink(entry);
}

function logToConsole(e: ExternalLogEntry): void {
  const outcome = e.error ?? e.status ?? "—";
  console.log(
    `[testomatio→] ${e.method} ${e.url} → ${outcome} (${e.durationMs}ms)`,
    { request: truncate(e.requestBody), response: truncate(e.responseBody) }
  );
}

function truncate(value: string | null): string | null {
  if (!value) return value;
  if (value.length <= MAX_BODY) return value;
  return `${value.slice(0, MAX_BODY)}… (+${value.length - MAX_BODY} more chars)`;
}

function readRequestBody(body: BodyInit | null | undefined): string | null {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body instanceof FormData) return "[FormData]";
  return "[binary]";
}

type Sink = (entry: ExternalLogEntry) => void;

export interface ExternalLogEntry {
  id: number;
  ts: number;
  method: string;
  url: string;
  requestBody: string | null;
  status: number | null;
  ok: boolean;
  responseBody: string | null;
  error: string | null;
  durationMs: number;
}
