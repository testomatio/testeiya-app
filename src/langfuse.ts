import { randomBytes } from "node:crypto";

const CLOUD = "https://cloud.langfuse.com";
const OTLP_PATH = "/api/public/otel/v1/traces";
/** A tool result can be a whole file. Long values are cut, never dropped. */
const MAX_VALUE = 100_000;

/** Langfuse keys, or null when this run is not traced. */
export function langfuseConfig(env: NodeJS.ProcessEnv = process.env): LangfuseConfig | null {
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return null;
  let baseUrl = env.LANGFUSE_BASE_URL ?? env.LANGFUSE_BASEURL ?? CLOUD;
  while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  return { publicKey, secretKey, baseUrl };
}

/**
 * Spans held in memory, shipped as one OTLP request. Langfuse reads OTLP over
 * plain JSON, so a trace costs no dependency: an install of this CLI carries no
 * OpenTelemetry SDK for a feature most runs never turn on.
 */
export function createTracer(config: LangfuseConfig): Tracer {
  const finished: OtlpSpan[] = [];
  let reported = false;

  return { trace, flush };

  function trace(name: string, fields: SpanFields): Span {
    return open(randomBytes(16).toString("hex"), undefined, name, { type: "agent", ...fields });
  }

  function open(
    traceId: string,
    parentSpanId: string | undefined,
    name: string,
    fields: SpanFields
  ): Span {
    const spanId = randomBytes(8).toString("hex");
    const startTimeUnixNano = nanos();
    let current = fields;
    let ended = false;

    return {
      child(childName, childFields) {
        return open(traceId, spanId, childName, childFields);
      },
      update(extra) {
        current = { ...current, ...extra };
      },
      end(extra) {
        if (ended) return;
        ended = true;
        current = { ...current, ...extra };
        finished.push({
          traceId,
          spanId,
          parentSpanId,
          name,
          kind: 1,
          startTimeUnixNano,
          endTimeUnixNano: nanos(),
          attributes: spanAttributes(name, current, !parentSpanId),
          status: {},
        });
      },
    };
  }

  async function flush(): Promise<void> {
    if (finished.length === 0) return;
    const batch = finished.splice(0, finished.length);
    const auth = Buffer.from(`${config.publicKey}:${config.secretKey}`).toString("base64");
    const response = await fetch(`${config.baseUrl}${OTLP_PATH}`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify(otlpPayload(batch)),
    }).catch((err: unknown) => err as Error);

    if (response instanceof Error) return warn(response.message);
    if (!response.ok) warn(`${config.baseUrl} answered ${response.status}`);
  }

  // A trace nobody can see must never take the run down with it, and one line
  // is enough: a broken key breaks every flush the same way.
  function warn(message: string): void {
    if (reported) return;
    reported = true;
    process.stderr.write(`  langfuse: ${message}\n`);
  }
}

export function otlpPayload(spans: OtlpSpan[]): OtlpPayload {
  return {
    resourceSpans: [
      {
        resource: { attributes: [attribute("service.name", "testeiya")] },
        scopeSpans: [{ scope: { name: "testeiya" }, spans }],
      },
    ],
  };
}

export function spanAttributes(name: string, fields: SpanFields, root: boolean): OtlpAttribute[] {
  const out: OtlpAttribute[] = [];
  push(out, "langfuse.observation.type", fields.type);
  push(out, "langfuse.observation.input", fields.input);
  push(out, "langfuse.observation.output", fields.output);
  push(out, "langfuse.observation.model.name", fields.model);
  push(out, "langfuse.observation.usage_details", fields.usage);
  push(out, "langfuse.observation.cost_details", fields.cost);
  push(out, "langfuse.observation.metadata", fields.metadata);
  push(out, "langfuse.observation.level", fields.level);
  if (!root) return out;
  push(out, "langfuse.trace.name", name);
  push(out, "langfuse.trace.input", fields.input);
  push(out, "langfuse.trace.output", fields.output);
  push(out, "langfuse.trace.tags", fields.tags);
  push(out, "langfuse.trace.metadata", fields.metadata);
  push(out, "langfuse.session.id", fields.sessionId);
  return out;
}

function push(out: OtlpAttribute[], key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  out.push(attribute(key, serialize(value)));
}

function attribute(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}

function serialize(value: unknown): string {
  let text = "";
  if (typeof value === "string") text = value;
  if (typeof value !== "string") text = json(value);
  if (text.length <= MAX_VALUE) return text;
  return `${text.slice(0, MAX_VALUE)}… (${text.length - MAX_VALUE} more)`;
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function nanos(): string {
  return `${Date.now()}000000`;
}

export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

export interface Tracer {
  /** Opens a trace of its own. Everything below it hangs off this span. */
  trace(name: string, fields: SpanFields): Span;
  flush(): Promise<void>;
}

export interface Span {
  child(name: string, fields: SpanFields): Span;
  update(fields: SpanFields): void;
  end(fields?: SpanFields): void;
}

export interface SpanFields {
  type?: "agent" | "generation" | "tool" | "span";
  input?: unknown;
  output?: unknown;
  model?: string;
  usage?: Record<string, number>;
  cost?: Record<string, number>;
  metadata?: Record<string, unknown>;
  level?: "DEFAULT" | "WARNING" | "ERROR";
  tags?: string[];
  sessionId?: string;
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: Record<string, never>;
}

export interface OtlpAttribute {
  key: string;
  value: { stringValue: string };
}

export interface OtlpPayload {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeSpans: Array<{ scope: { name: string }; spans: OtlpSpan[] }>;
  }>;
}
