import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Server-side instrumentation for the sidebar Debug panel. The real outbound
 * calls to the Testomat.io API server happen here in the Bun process (the v2
 * proxy, attachment upload, transcription) — the browser only ever sees the
 * same-origin `/api/testomatio/*` proxy hop. `loggedServerFetch` wraps each
 * upstream call, keeps a small ring buffer, and notifies subscribers; the
 * `/api/debug/stream` SSE endpoint forwards entries to the client panel, where
 * they show up as the `testomatio` ("tmt") channel.
 *
 * While debug mode is on — the panel is open (an SSE subscriber is connected)
 * or `TESTEIYA_DEBUG=1` is set — each request + response is also appended to
 * `cli/log/testomatio.http` (gitignored) as a re-runnable `.http` block
 * (VS Code REST Client / JetBrains), with the response captured as trailing
 * comments so the agent can verify the REST API. The file includes the
 * `Authorization` header so requests actually replay; that token never reaches
 * the panel or the SSE feed.
 */

const MAX_ENTRIES = 200;
const MAX_BODY = 16000;
const FILE_RESPONSE_MAX = 6000;
const LOG_DIR = fileURLToPath(new URL("../log", import.meta.url));
const REPLAY_FILE = join(LOG_DIR, "testomatio.http");

let seq = 0;
let dirReady = false;
const buffer: DebugEntry[] = [];
const subscribers = new Set<(entry: DebugEntry) => void>();

export async function loggedServerFetch(
  url: string,
  init: RequestInit,
  requestBody?: string | null
): Promise<{ res: Response; text: string }> {
  const method = (init.method ?? "GET").toUpperCase();
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    record(
      {
        method,
        url,
        requestBody: requestBody ?? null,
        status: res.status,
        ok: res.ok,
        responseBody: text,
        error: null,
        durationMs: Date.now() - started,
      },
      init.headers
    );
    return { res, text };
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    record(
      {
        method,
        url,
        requestBody: requestBody ?? null,
        status: null,
        ok: false,
        responseBody: null,
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - started,
      },
      init.headers
    );
    throw e;
  }
}

export function subscribeDebug(cb: (entry: DebugEntry) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function recentDebugEntries(): DebugEntry[] {
  return buffer.slice();
}

/*
 * Generic sink for any non-request debug entry (currently the `ai` channel —
 * pi-coding-agent LLM interactions; see `ai-debug.ts`). Shares the request ring
 * buffer + subscribers so it replays on connect and rides the same
 * `/api/debug/stream` SSE feed.
 */
export function publish(entry: Omit<DebugEntry, "id" | "ts">): void {
  seq += 1;
  const full = { ...entry, id: seq, ts: Date.now() } as DebugEntry;
  buffer.push(full);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  for (const cb of subscribers) cb(full);
}

function record(
  partial: Omit<ServerRequestEntry, "id" | "ts" | "kind" | "channel">,
  headers?: HeadersInit
): void {
  seq += 1;
  const entry: ServerRequestEntry = {
    kind: "request",
    channel: "testomatio",
    id: seq,
    ts: Date.now(),
    ...partial,
    requestBody: truncate(partial.requestBody),
    responseBody: truncate(partial.responseBody),
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  const outcome = entry.error ?? entry.status ?? "—";
  console.log(
    `[testomatio→] ${entry.method} ${entry.url} → ${outcome} (${entry.durationMs}ms)`
  );
  for (const cb of subscribers) cb(entry);
  writeReplayFile(entry, partial.requestBody, headers);
}

function writeReplayFile(
  entry: ServerRequestEntry,
  requestBody: string | null,
  headers?: HeadersInit
): void {
  if (subscribers.size === 0 && process.env.TESTEIYA_DEBUG !== "1") return;
  try {
    if (!dirReady) {
      mkdirSync(LOG_DIR, { recursive: true });
      dirReady = true;
    }
    appendFileSync(REPLAY_FILE, formatHttp(entry, requestBody, headers));
  } catch {}
}

function formatHttp(
  entry: ServerRequestEntry,
  requestBody: string | null,
  headers?: HeadersInit
): string {
  const ts = new Date(entry.ts).toISOString();
  const resource = entry.url.replace(/\?.*$/, "").split("/").pop() || entry.url;
  const outcome = entry.error ? `ERR ${entry.error}` : entry.status;
  const lines = [
    `### ${entry.method} ${resource} — ${ts} → ${outcome} (${entry.durationMs}ms)`,
    `${entry.method} ${entry.url}`,
  ];
  for (const [key, value] of headerEntries(headers)) lines.push(`${key}: ${value}`);
  if (requestBody && requestBody.startsWith("[multipart]")) {
    lines.push(`# ${requestBody} (binary body not captured)`);
  }
  if (requestBody && !requestBody.startsWith("[multipart]")) {
    lines.push("", requestBody);
  }
  lines.push("", ...responseComment(entry), "", "");
  return lines.join("\n");
}

function responseComment(entry: ServerRequestEntry): string[] {
  if (entry.error) return [`# ── error: ${entry.error} ──`];
  const head = `# ── response ${entry.status} (${entry.durationMs}ms) ──`;
  if (!entry.responseBody) return [head];
  let body = entry.responseBody;
  if (body.length > FILE_RESPONSE_MAX) {
    body = `${body.slice(0, FILE_RESPONSE_MAX)}… (truncated)`;
  }
  return [head, ...body.split("\n").map((line) => `# ${line}`)];
}

function headerEntries(headers?: HeadersInit): [string, string][] {
  if (!headers) return [];
  if (headers instanceof Headers) return [...headers.entries()];
  if (Array.isArray(headers)) return headers as [string, string][];
  return Object.entries(headers);
}

function truncate(value: string | null): string | null {
  if (!value) return value;
  if (value.length <= MAX_BODY) return value;
  return `${value.slice(0, MAX_BODY)}… (+${value.length - MAX_BODY} more chars)`;
}

export interface ServerRequestEntry {
  kind: "request";
  channel: "testomatio";
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

// Mirrors `AiLogEntry` in `lib/debug/external-log.ts` so entries ride the SSE
// feed straight into the panel's `record()`.
export interface AiEventEntry {
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

export type DebugEntry = ServerRequestEntry | AiEventEntry;
