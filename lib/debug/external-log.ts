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
const SKIP_EVENTS = new Set([
  "text-delta",
  "reasoning-delta",
  "tool-output-partial",
  "ping",
]);
// Endpoints the UI polls on a timer, plus the debug plumbing itself — recording
// every hit would drown the panel. Mirrors QUIET_API_PREFIXES in
// cli/src/app-server.ts; failures are still recorded.
const QUIET_API_PREFIXES = ["/api/playwright/status", "/api/files/tree", "/api/debug"];

let sink: Sink | null = null;
let seq = 0;
let consoleCaptured = false;

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

/**
 * Record a WebSocket lifecycle event (connect/open/close/error/stall) into the
 * same log the Debug panel and the server report read — the native browser
 * "WebSocket connection failed" line reaches neither `console` nor `window`
 * error handlers, so without this a failed connection leaves no trace.
 */
export function logWsEvent(name: string, summary: string, ok: boolean): void {
  record({ kind: "event", channel: "agent", name, summary, ok, detail: null });
}

/*
 * Capture `console.error`/`console.warn` and uncaught errors into the same log
 * so the Debug panel and the server-bound report see them. Runs once, client
 * only. Console output is forwarded to the original console; the `console`
 * channel is skipped by `logToConsole` so it isn't printed (and re-captured)
 * twice.
 */
export function initConsoleCapture(): void {
  if (consoleCaptured || typeof window === "undefined") return;
  consoleCaptured = true;
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      record({
        kind: "event",
        channel: "console",
        name: level,
        summary: consoleSummary(args),
        ok: level !== "error",
        detail: truncate(consoleDetail(args)),
      });
    };
  }
  window.addEventListener("error", (e) =>
    record({
      kind: "event",
      channel: "console",
      name: "uncaught",
      summary: e.message,
      ok: false,
      detail: truncate(errorDetail(e.error, `${e.filename}:${e.lineno}:${e.colno}`)),
    })
  );
  window.addEventListener("unhandledrejection", (e) =>
    record({
      kind: "event",
      channel: "console",
      name: "unhandledrejection",
      summary: e.reason instanceof Error ? e.reason.message : String(e.reason),
      ok: false,
      detail: truncate(errorDetail(e.reason)),
    })
  );
}

function recordRequest(
  partial: Omit<RequestLogEntry, "id" | "ts" | "kind">
): void {
  if (partial.ok && QUIET_API_PREFIXES.some((prefix) => partial.url.startsWith(prefix))) return;
  record({ kind: "request", ...partial });
}

function record(partial: WithoutMeta<DebugLogEntry>): void {
  seq += 1;
  const entry = { id: seq, ts: Date.now(), ...partial } as DebugLogEntry;
  logToConsole(entry);
  if (sink) sink(entry);
}

function logToConsole(e: DebugLogEntry): void {
  if (e.kind !== "request") {
    if (e.channel === "console") return;
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

function consoleSummary(args: unknown[]): string {
  const first = args[0];
  if (typeof first === "string") return first.slice(0, 200);
  if (first instanceof Error) return first.message;
  return consoleDetail(args).slice(0, 200);
}

function consoleDetail(args: unknown[]): string {
  return args.map(formatArg).join(" ");
}

function errorDetail(error: unknown, where?: string): string {
  const head = where ? `${where}\n` : "";
  if (error instanceof Error) return `${head}${error.stack ?? error.message}`;
  return `${head}${formatArg(error)}`;
}

function formatArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.message}\n${value.stack ?? ""}`;
  return safeJson(value) ?? String(value);
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

export type DebugLogEntry = RequestLogEntry | EventLogEntry | AiLogEntry;

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
  /**
   * `agent` = pi/WS event; `console` = captured console / uncaught error;
   * `check-tests` = a server-side `check-tests` sync run (from the SSE feed).
   */
  channel: "agent" | "console" | "check-tests";
  id: number;
  ts: number;
  /** The pi/WS event `type` (e.g. `tool-input-available`) or console level. */
  name: string;
  /** Short inline hint shown on the row (tool name, model, …). */
  summary: string | null;
  ok: boolean;
  /** Pretty-printed event payload (truncated). */
  detail: string | null;
}

/**
 * LLM-level event published server-side (`cli/src/ai-debug.ts` via `debug-bus`)
 * and delivered over the `/api/debug/stream` SSE feed. Mirrors `AiEventEntry`.
 */
export interface AiLogEntry {
  kind: "ai";
  channel: "ai";
  id: number;
  ts: number;
  name: string;
  summary: string | null;
  ok: boolean;
  model: string | null;
  durationMs: number | null;
  tokens: { input: number; output: number; total: number } | null;
  detail: string | null;
}
