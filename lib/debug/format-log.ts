import type {
  AiLogEntry,
  DebugLogEntry,
  EventLogEntry,
  RequestLogEntry,
} from "./external-log";

/**
 * Render the Debug panel's entry ring as shareable plain text (for "Copy
 * logs"). Requests get a one-liner each, with bodies appended only on
 * failures; event payloads are included only for errors and console captures —
 * so chat/message content never lands on the clipboard.
 */
export function formatDebugLog(
  entries: DebugLogEntry[],
  meta: Record<string, unknown> = {}
): string {
  const lines = [`Testeiya client log — ${new Date().toISOString()}`];
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === "string") {
      lines.push(`${key}: ${value}`);
      continue;
    }
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push("");
  const ordered = [...entries].sort((a, b) => a.ts - b.ts);
  for (const entry of ordered) {
    if (entry.kind === "request") {
      lines.push(...formatRequest(entry));
      continue;
    }
    lines.push(...formatEvent(entry));
  }
  return lines.join("\n");
}

function formatRequest(e: RequestLogEntry): string[] {
  const outcome = e.error ?? String(e.status ?? "—");
  const lines = [
    `${clock(e.ts)} [${e.channel}] ${e.method} ${e.url} → ${outcome} (${e.durationMs}ms)`,
  ];
  const failed = !e.ok || (e.status !== null && e.status >= 400);
  if (!failed) return lines;
  if (e.requestBody) lines.push(indent(`request: ${e.requestBody}`));
  if (e.responseBody) lines.push(indent(`response: ${e.responseBody}`));
  return lines;
}

function formatEvent(e: EventLogEntry | AiLogEntry): string[] {
  let head = `${clock(e.ts)} [${e.channel}] ${e.name}`;
  if (e.summary) head += ` — ${e.summary}`;
  if (e.kind === "ai" && e.tokens) {
    head += ` (${e.tokens.input} in / ${e.tokens.output} out tokens)`;
  }
  if (!e.ok) head += " [ERROR]";
  const lines = [head];
  if (e.detail && (!e.ok || e.channel === "console")) {
    lines.push(indent(e.detail));
  }
  return lines;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
}
