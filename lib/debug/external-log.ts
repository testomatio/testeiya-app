/*
 * Instrumentation bus for the sidebar Debug panel. Producers feed one sink
 * (the DebugLogService): `loggedFetch` and `logApiRequest` record same-origin
 * `/api/*` calls (the `api` channel — including the `/api/testomatio/*` proxy
 * hops), and `logAgentEvent` records pi-coding-agent events streamed over the
 * WebSocket. The real outbound Testomat.io API calls happen server-side and
 * arrive in the panel as the `testomatio` channel via the `/api/debug/stream`
 * SSE feed (see `DebugLogService`). Every entry is also printed to the console.
 */

const MAX_BODY = 2000;
// Streaming chunk events fire hundreds of times per turn — they're content, not
// state, and would drown out everything useful. The heartbeat is just as noisy.
const SKIP_EVENTS = new Set(["text-delta", "reasoning-delta", "ping"]);

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
    recordRequest({
      channel: "api",
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
    recordRequest({
      channel: "api",
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

export function logApiRequest(
  entry: Omit<RequestLogEntry, "id" | "ts" | "kind" | "channel">
): void {
  recordRequest({ channel: "api", ...entry });
}

export function logAgentEvent(data: Record<string, unknown>): void {
  const name = typeof data.type === "string" ? data.type : "message";
  if (SKIP_EVENTS.has(name)) return;
  record({
    kind: "event",
    channel: "agent",
    name,
    summary: eventSummary(name, data),
    ok: name !== "error",
    detail: truncate(safeJson(data)),
  });
}

function recordRequest(
  partial: Omit<RequestLogEntry, "id" | "ts" | "kind">
): void {
  record({ kind: "request", ...partial });
}

function record(partial: WithoutMeta<DebugLogEntry>): void {
  seq += 1;
  const entry = { id: seq, ts: Date.now(), ...partial } as DebugLogEntry;
  logToConsole(entry);
  if (sink) sink(entry);
}

function logToConsole(e: DebugLogEntry): void {
  if (e.kind === "event") {
    console.log(`[agent] ${e.name}${e.summary ? ` ${e.summary}` : ""}`);
    return;
  }
  const outcome = e.error ?? e.status ?? "—";
  const tag = e.channel === "api" ? "api→" : "testomatio→";
  console.log(
    `[${tag}] ${e.method} ${e.url} → ${outcome} (${e.durationMs}ms)`,
    { request: truncate(e.requestBody), response: truncate(e.responseBody) }
  );
}

function eventSummary(name: string, data: Record<string, unknown>): string | null {
  if (name === "tool-input-available") return str(data.toolName);
  if (name === "tool-output-available") return str(data.toolCallId);
  if (name === "session_created") return str(data.model);
  if (name === "skill") return str(data.name);
  if (name === "start") return str(data.messageId);
  if (name === "error") return str(data.error);
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return null;
  return String(value);
}

function safeJson(value: unknown): string | null {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
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

type Sink = (entry: DebugLogEntry) => void;

// Distributes over the union so each member keeps its own keys (a plain
// `Omit<A | B, K>` collapses to only the keys common to A and B).
type WithoutMeta<T> = T extends unknown ? Omit<T, "id" | "ts"> : never;

export type DebugLogEntry = RequestLogEntry | EventLogEntry;

export interface RequestLogEntry {
  kind: "request";
  /** `testomatio` = outbound API; `api` = same-origin `/api/*`. */
  channel: "testomatio" | "api";
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

export interface EventLogEntry {
  kind: "event";
  channel: "agent";
  id: number;
  ts: number;
  /** The pi/WS event `type` (e.g. `tool-input-available`). */
  name: string;
  /** Short inline hint shown on the row (tool name, model, …). */
  summary: string | null;
  ok: boolean;
  /** Pretty-printed event payload (truncated). */
  detail: string | null;
}
