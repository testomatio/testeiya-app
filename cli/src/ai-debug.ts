import { publish, type AiEventEntry } from "./debug-bus.js";

/*
 * Pluggable PI → Debug-panel recorder. `attachAiDebug(session)` adds one
 * independent listener to a pi-coding-agent session and maps the LLM-level
 * events the WS bridge never forwards — per-turn model responses, the errors a
 * failed turn hides behind a plain `finish`, and auto-retry/fallback/compaction
 * — into the panel's `ai` channel via `debug-bus`'s `publish`. The returned
 * unsubscribe is called from `connection.ts` when the session is torn down.
 */

const MAX_DETAIL = 16000;

export function attachAiDebug(session: any): () => void {
  return session.subscribe((event: any) => {
    const entry = mapAiEvent(event);
    if (entry) publish(entry);
  });
}

function mapAiEvent(event: any): AiEventInput | null {
  if (event.type === "turn_end") return turnEntry(event.message);
  if (event.type === "auto_retry_start") return retryStart(event);
  if (event.type === "auto_retry_end") return retryEnd(event);
  if (event.type === "retry_fallback_applied")
    return fallback(`${event.from} → ${event.to} (${event.role})`, event.to, event);
  if (event.type === "retry_fallback_succeeded")
    return fallback(`${event.model} (${event.role})`, event.model, event);
  if (event.type === "auto_compaction_start")
    return compaction(`${event.reason} → ${event.action}`, true, event);
  if (event.type === "auto_compaction_end") return compactionEnd(event);
  return null;
}

function turnEntry(message: any): AiEventInput | null {
  if (!message || message.role !== "assistant") return null;
  const entry: AiEventInput = {
    kind: "ai",
    channel: "ai",
    name: "response",
    summary: `${message.model} · ${message.stopReason}`,
    ok: true,
    model: message.model ?? null,
    durationMs: numberOrNull(message.duration),
    tokens: tokensOf(message.usage),
    detail: detail({
      model: message.model,
      provider: message.provider,
      stopReason: message.stopReason,
      errorMessage: message.errorMessage,
      usage: message.usage,
      ttft: message.ttft,
      duration: message.duration,
      text: assistantText(message.content),
    }),
  };
  if (message.stopReason !== "error") return entry;
  entry.name = "error";
  entry.ok = false;
  entry.summary = message.errorMessage ?? "error";
  return entry;
}

function retryStart(event: any): AiEventInput {
  return {
    kind: "ai",
    channel: "ai",
    name: "retry",
    ok: false,
    summary: `attempt ${event.attempt}/${event.maxAttempts} — ${event.errorMessage}`,
    model: null,
    durationMs: numberOrNull(event.delayMs),
    tokens: null,
    detail: detail(event),
  };
}

function retryEnd(event: any): AiEventInput {
  const entry: AiEventInput = {
    kind: "ai",
    channel: "ai",
    name: "retry",
    ok: true,
    summary: `recovered on attempt ${event.attempt}`,
    model: null,
    durationMs: null,
    tokens: null,
    detail: detail(event),
  };
  if (event.success) return entry;
  entry.name = "error";
  entry.ok = false;
  entry.summary = event.finalError ?? "retries exhausted";
  return entry;
}

function fallback(summary: string, model: string | undefined, event: any): AiEventInput {
  return {
    kind: "ai",
    channel: "ai",
    name: "fallback",
    ok: true,
    summary,
    model: model ?? null,
    durationMs: null,
    tokens: null,
    detail: detail(event),
  };
}

function compactionEnd(event: any): AiEventInput {
  if (event.errorMessage) return compaction(event.errorMessage, false, event);
  return compaction(`${event.action} done`, true, event);
}

function compaction(summary: string, ok: boolean, event: any): AiEventInput {
  return {
    kind: "ai",
    channel: "ai",
    name: "compaction",
    ok,
    summary,
    model: null,
    durationMs: null,
    tokens: null,
    detail: detail(event),
  };
}

function tokensOf(usage: any): AiEventEntry["tokens"] {
  if (!usage) return null;
  return { input: usage.input ?? 0, output: usage.output ?? 0, total: usage.totalTokens ?? 0 };
}

function assistantText(content: any): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (part?.type === "text") parts.push(part.text ?? "");
    if (part?.type === "thinking") parts.push(`[thinking] ${part.thinking ?? part.text ?? ""}`);
    if (part?.type === "toolCall") parts.push(`[tool:${part.name}]`);
  }
  return parts.filter(Boolean).join("\n");
}

function numberOrNull(value: any): number | null {
  if (typeof value === "number") return value;
  return null;
}

function detail(value: any): string | null {
  let json: string;
  try {
    json = JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
  if (json.length <= MAX_DETAIL) return json;
  return `${json.slice(0, MAX_DETAIL)}… (+${json.length - MAX_DETAIL} more chars)`;
}

type AiEventInput = Omit<AiEventEntry, "id" | "ts">;
