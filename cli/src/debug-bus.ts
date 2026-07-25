import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { log, type WideEvent } from "evlog";
import { readMemoryLogs } from "evlog/memory";

/*
 * Server-side instrumentation for the sidebar Debug panel, built on the evlog
 * pipeline that `file-log.ts` initializes. The real outbound calls to the
 * Testomat.io API server happen here in the Bun process (the v2 proxy,
 * attachment upload, transcription) — the browser only ever sees the
 * same-origin `/api/testomatio/*` proxy hop. `loggedServerFetch` (and
 * `publish` for the `ai` / `check-tests` channels) emits one evlog wide event
 * per call; the shared drain fans it out to the NDJSON app log, the in-memory
 * ring buffer (`evlog/memory` — the snapshot's source), and `panelDrain`
 * below, which maps panel-facing channels onto the `DebugEntry` wire shapes
 * the `/api/debug/stream` SSE feed and the client panel already speak.
 *
 * While debug mode is on — the panel is open (an SSE subscriber is connected)
 * or `TESTEIYA_DEBUG=1` is set — each request + response is also appended to
 * `cli/log/testomatio.http` (gitignored) as a re-runnable `.http` block
 * (VS Code REST Client / JetBrains), with the response captured as trailing
 * comments so the agent can verify the REST API. The file includes the
 * `Authorization` header so requests actually replay; that token never reaches
 * the panel or the SSE feed.
 */

const MAX_BODY = 16000;
const FILE_RESPONSE_MAX = 6000;
const LOG_DIR = fileURLToPath(new URL("../log", import.meta.url));
const REPLAY_FILE = join(LOG_DIR, "testomatio.http");

let panelSeq = 0;
let dirReady = false;
let latestReportKey: string | null = null;
const clientReports = new Map<string, ClientReport>();
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

/**
 * Record a `check-tests` subprocess run (pull/push) as a Debug-panel event so its
 * outcome + full output are visible alongside requests — the same feed the panel
 * already renders, so an exit-1 sync stops being a silent "[check-tests] exited 1".
 */
export function publishCheckTests(run: {
  action: string;
  dir: string;
  code: number | null;
  output: string;
  durationMs: number;
}): void {
  publish({
    kind: "event",
    channel: "check-tests",
    name: `check-tests ${run.action}`,
    summary: `${run.code === 0 ? "ok" : `exit ${run.code}`} · ${run.dir} · ${run.durationMs}ms`,
    ok: run.code === 0,
    detail: truncate(run.output),
  });
}

export function subscribeDebug(cb: (entry: DebugEntry) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function recentDebugEntries(): DebugEntry[] {
  return readMemoryLogs()
    .map(toPanelEntry)
    .filter((entry): entry is DebugEntry => !!entry);
}

/*
 * Latest client debug report per session — the browser's unified activity log
 * (`api` + `agent` + `console` channels) plus a MobX store snapshot, pushed via
 * `POST /api/debug/report`. Keyed by session so a snapshot request can pick the
 * matching one; `latestReportKey` is the fallback when no session is given.
 */
export function recordClientReport(report: ClientReport): void {
  const key = report.sessionId || "default";
  clientReports.set(key, report);
  latestReportKey = key;
}

export function buildSnapshot(sessionId?: string | null): DebugSnapshot {
  const events = readMemoryLogs();
  const entries = events.map(toPanelEntry);
  return {
    generatedAt: new Date().toISOString(),
    server: {
      requests: entries.filter((e): e is ServerRequestEntry => !!e && e.kind === "request"),
      ai: entries.filter((e): e is AiEventEntry => !!e && e.kind === "ai"),
      checkTests: entries.filter((e): e is ProcessEventEntry => !!e && e.kind === "event"),
      console: events.filter((e) => e.tag === "console").map(toConsoleEntry),
      api: events.filter((e) => e.channel === "api"),
      prompts: events.filter((e) => e.channel === "prompt"),
    },
    client: getClientReport(sessionId),
    langfuseHint: "bun run debug:trace session:<agent-conversation-id>",
  };
}

export function clientLayout(
  sessionId?: string | null
): { layout: unknown; reportedAt: string | null; url: string | null } | null {
  const report = getClientReport(sessionId);
  if (!report) return null;
  let url: string | null = null;
  const meta = report.meta as { url?: unknown } | null;
  if (meta && typeof meta.url === "string") url = meta.url;
  return { layout: report.layout ?? null, reportedAt: report.reportedAt, url };
}

/*
 * Generic sink for any non-request debug entry (currently the `ai` channel —
 * pi-coding-agent LLM interactions; see `ai-debug.ts`). Emits an evlog wide
 * event, which the shared drain routes to the file/memory sinks and back into
 * `panelDrain` for the live SSE feed.
 */
export function publish(entry: WithoutMeta<DebugEntry>): void {
  const { kind: _, ...fields } = entry;
  if (entry.ok) {
    log.info(fields);
    return;
  }
  log.error(fields);
}

/**
 * Drain hook wired into the evlog pipeline by `file-log.ts`: maps panel-facing
 * wide events onto the `DebugEntry` wire shapes and pushes them to the live
 * SSE subscribers. Non-panel channels (`api`, `prompt`, `console`) stay in the
 * file/memory sinks only.
 */
export function panelDrain(event: WideEvent): void {
  const entry = toPanelEntry(event);
  if (!entry) return;
  for (const cb of subscribers) cb(entry);
}

function getClientReport(sessionId?: string | null): ClientReport | null {
  if (sessionId && clientReports.has(sessionId)) return clientReports.get(sessionId)!;
  if (latestReportKey) return clientReports.get(latestReportKey) ?? null;
  return null;
}

function toPanelEntry(event: WideEvent): DebugEntry | null {
  const e = event as Record<string, any>;
  const channel = e.channel;
  if (channel !== "testomatio" && channel !== "ai" && channel !== "check-tests") return null;
  if (!e._panelId) {
    panelSeq += 1;
    e._panelId = panelSeq;
  }
  const id = e._panelId as number;
  const ts = Date.parse(e.timestamp) || Date.now();
  if (channel === "testomatio") {
    return {
      kind: "request",
      channel: "testomatio",
      id,
      ts,
      method: e.method,
      url: e.url,
      requestBody: e.requestBody ?? null,
      status: e.status ?? null,
      ok: !!e.ok,
      responseBody: e.responseBody ?? null,
      error: e.error ?? null,
      durationMs: e.durationMs ?? 0,
    };
  }
  if (channel === "ai") {
    return {
      kind: "ai",
      channel: "ai",
      id,
      ts,
      name: e.name,
      summary: e.summary ?? null,
      ok: !!e.ok,
      model: e.model ?? null,
      durationMs: e.durationMs ?? null,
      tokens: e.tokens ?? null,
      detail: e.detail ?? null,
    };
  }
  return {
    kind: "event",
    channel: "check-tests",
    id,
    ts,
    name: e.name,
    summary: e.summary ?? null,
    ok: !!e.ok,
    detail: e.detail ?? null,
  };
}

function toConsoleEntry(event: WideEvent): ServerConsoleEntry {
  let level: ServerConsoleEntry["level"] = "log";
  if (event.level === "warn") level = "warn";
  if (event.level === "error") level = "error";
  return {
    level,
    ts: Date.parse(event.timestamp) || 0,
    text: String((event as Record<string, unknown>).message ?? ""),
  };
}

function record(partial: RequestData, headers?: HeadersInit): void {
  const outcome = partial.error ?? partial.status ?? "—";
  console.log(
    `[testomatio→] ${partial.method} ${partial.url} → ${outcome} (${partial.durationMs}ms)`
  );
  const event = {
    channel: "testomatio",
    ...partial,
    requestBody: truncate(partial.requestBody),
    responseBody: truncate(partial.responseBody),
  };
  if (partial.ok) log.info(event);
  else log.error(event);
  writeReplayFile(partial, headers);
}

function writeReplayFile(data: RequestData, headers?: HeadersInit): void {
  if (subscribers.size === 0 && process.env.TESTEIYA_DEBUG !== "1") return;
  try {
    if (!dirReady) {
      mkdirSync(LOG_DIR, { recursive: true });
      dirReady = true;
    }
    appendFileSync(REPLAY_FILE, formatHttp(data, headers));
  } catch {}
}

function formatHttp(data: RequestData, headers?: HeadersInit): string {
  const ts = new Date().toISOString();
  const resource = data.url.replace(/\?.*$/, "").split("/").pop() || data.url;
  const outcome = data.error ? `ERR ${data.error}` : data.status;
  const lines = [
    `### ${data.method} ${resource} — ${ts} → ${outcome} (${data.durationMs}ms)`,
    `${data.method} ${data.url}`,
  ];
  for (const [key, value] of headerEntries(headers)) lines.push(`${key}: ${value}`);
  if (data.requestBody && data.requestBody.startsWith("[multipart]")) {
    lines.push(`# ${data.requestBody} (binary body not captured)`);
  }
  if (data.requestBody && !data.requestBody.startsWith("[multipart]")) {
    lines.push("", data.requestBody);
  }
  lines.push("", ...responseComment(data), "", "");
  return lines.join("\n");
}

function responseComment(data: RequestData): string[] {
  if (data.error) return [`# ── error: ${data.error} ──`];
  const head = `# ── response ${data.status} (${data.durationMs}ms) ──`;
  if (!data.responseBody) return [head];
  let body = data.responseBody;
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

type RequestData = Omit<ServerRequestEntry, "id" | "ts" | "kind" | "channel">;

// Distributes over the union so each member keeps its own keys (a plain
// `Omit<A | B, K>` collapses to only the keys common to A and B).
type WithoutMeta<T> = T extends unknown ? Omit<T, "id" | "ts"> : never;

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

// A `check-tests` subprocess run, shaped to match the client's `EventLogEntry`
// so it rides the SSE feed straight into the panel's event rows.
export interface ProcessEventEntry {
  kind: "event";
  channel: "check-tests";
  id: number;
  ts: number;
  name: string;
  summary: string | null;
  ok: boolean;
  detail: string | null;
}

export type DebugEntry = ServerRequestEntry | AiEventEntry | ProcessEventEntry;

export interface ServerConsoleEntry {
  level: "log" | "warn" | "error";
  ts: number;
  text: string;
}

export interface ClientReport {
  sessionId: string | null;
  reason: string;
  reportedAt: string;
  entries: unknown[];
  store: unknown;
  meta: unknown;
  layout?: unknown;
}

export interface DebugSnapshot {
  generatedAt: string;
  server: {
    requests: ServerRequestEntry[];
    ai: AiEventEntry[];
    checkTests: ProcessEventEntry[];
    console: ServerConsoleEntry[];
    api: WideEvent[];
    prompts: WideEvent[];
  };
  client: ClientReport | null;
  langfuseHint: string;
}
