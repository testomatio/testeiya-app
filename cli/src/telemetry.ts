// OpenTelemetry → Langfuse observability for the agent.
//
// Two parts:
//   1. initTelemetry() — one-time NodeSDK + LangfuseSpanProcessor bootstrap,
//      gated on LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY. A no-op (and no
//      dependency cost at runtime) when the keys are absent. Called from
//      app-server.ts right after the .env files are loaded.
//   2. createTelemetryExtension() — a per-session extension that turns the
//      agent's hook events into a Langfuse trace tree:
//        before_agent_start → root (agent) observation = one trace per prompt
//          message_start/_end → child generation (LLM call) with usage + cost
//          tool_execution_start/_end → child tool observation (args + result)
//        agent_end → close the trace and flush
//      All prompts of one agent session share the SDK sessionId, so Langfuse
//      groups them into a single session.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startObservation, LangfuseOtelSpanAttributes } from "@langfuse/tracing";
import type {
  LangfuseAgent,
  LangfuseGeneration,
  LangfuseTool,
  ObservationLevel,
} from "@langfuse/tracing";
import type { ExtensionFactory } from "@oh-my-pi/pi-coding-agent";

let processor: LangfuseSpanProcessor | undefined;
let sdk: NodeSDK | undefined;
let enabled = false;

export function initTelemetry(): void {
  if (sdk) return;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    console.log(
      "[telemetry] Langfuse disabled — set LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY to enable",
    );
    return;
  }

  const baseUrl = process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_BASEURL;
  processor = new LangfuseSpanProcessor({ publicKey, secretKey, baseUrl });
  sdk = new NodeSDK({ spanProcessors: [processor] });
  sdk.start();
  enabled = true;
  console.log(`[telemetry] Langfuse enabled → ${baseUrl ?? "https://cloud.langfuse.com"}`);
}

export function isTelemetryEnabled(): boolean {
  return enabled;
}

export async function flushTelemetry(): Promise<void> {
  if (!processor) return;
  try {
    await processor.forceFlush();
  } catch (err) {
    console.error(
      "[telemetry] flush failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export function createTelemetryExtension(meta: TelemetryMeta): ExtensionFactory {
  return ((pi: any) => {
    let root: LangfuseAgent | undefined;
    let generation: LangfuseGeneration | undefined;
    let contextMessages: unknown;
    const tools = new Map<string, LangfuseTool>();

    pi.on("before_agent_start", (event: any, ctx: any) => {
      if (root) endTrace();
      const prompt = event?.prompt ?? "";
      const name = traceName(prompt);
      root = startObservation(name, { input: prompt }, { asType: "agent" });
      root.update({
        metadata: {
          cwd: meta.cwd,
          model: meta.modelId,
          provider: meta.provider,
          projectIds: meta.projectIds,
        },
      });
      const span = root.otelSpan;
      span.setAttribute(LangfuseOtelSpanAttributes.TRACE_NAME, name);
      span.setAttribute(LangfuseOtelSpanAttributes.TRACE_INPUT, serialize(prompt));
      span.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_TAGS,
        JSON.stringify(["testeiya", meta.mode]),
      );
      const sessionId = ctx?.sessionManager?.getSessionId?.();
      if (sessionId) {
        span.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, sessionId);
      }
    });

    pi.on("context", (event: any) => {
      contextMessages = event?.messages;
    });

    pi.on("message_start", (event: any) => {
      if (!root) return;
      if (event?.message?.role !== "assistant") return;
      generation = root.startObservation(
        "llm-generation",
        { input: contextMessages ?? [], model: meta.modelId },
        { asType: "generation" },
      );
    });

    pi.on("message_end", (event: any) => {
      const msg = event?.message;
      if (!generation || msg?.role !== "assistant") return;
      generation.update({
        model: msg.model ?? meta.modelId,
        output: msg.content,
        usageDetails: usageDetails(msg.usage),
        costDetails: costDetails(msg.usage),
      });
      generation.end();
      generation = undefined;
    });

    pi.on("tool_execution_start", (event: any) => {
      if (!root) return;
      const name = event?.toolName ?? "tool";
      tools.set(
        event.toolCallId,
        root.startObservation(
          name,
          { input: event?.args, metadata: { toolName: name, intent: event?.intent } },
          { asType: "tool" },
        ),
      );
    });

    pi.on("tool_execution_end", (event: any) => {
      const span = tools.get(event?.toolCallId);
      if (!span) return;
      let level: ObservationLevel = "DEFAULT";
      if (event?.isError) level = "ERROR";
      span.update({ output: event?.result, level });
      span.end();
      tools.delete(event.toolCallId);
    });

    pi.on("agent_end", (event: any) => {
      if (!root) return;
      if (event?.isTerminal === false) return;
      const output = finalText(event?.messages);
      root.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_OUTPUT,
        serialize(output),
      );
      root.update({ output });
      endTrace();
      void flushTelemetry();
    });

    function endTrace(): void {
      for (const span of tools.values()) span.end();
      tools.clear();
      if (generation) {
        generation.end();
        generation = undefined;
      }
      if (root) {
        root.end();
        root = undefined;
      }
    }
  }) as ExtensionFactory;
}

function usageDetails(usage: any): Record<string, number> | undefined {
  if (!usage) return undefined;
  return {
    input: usage.input,
    output: usage.output,
    cache_read_input_tokens: usage.cacheRead,
    cache_creation_input_tokens: usage.cacheWrite,
    total: usage.totalTokens,
  };
}

function costDetails(usage: any): Record<string, number> | undefined {
  if (!usage?.cost) return undefined;
  return {
    input: usage.cost.input,
    output: usage.cost.output,
    total: usage.cost.total,
  };
}

function finalText(messages: any): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return textOf(messages[i].content);
  }
  return undefined;
}

function textOf(content: any): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .filter((c) => c?.type === "text")
    .map((c) => c.text)
    .join("\n");
}

function traceName(prompt: unknown): string {
  let text = "";
  if (typeof prompt === "string") text = prompt;
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "agent-run";
  if (firstLine.length <= 60) return firstLine;
  return `${firstLine.slice(0, 60)}…`;
}

function serialize(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

interface TelemetryMeta {
  cwd: string;
  mode: string;
  modelId?: string;
  provider?: string;
  projectIds?: string[];
}
