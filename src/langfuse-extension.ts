import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { VERSION } from "./env.js";
import { createTracer, langfuseConfig, type Span, type SpanFields } from "./langfuse.js";

/**
 * The run as a Langfuse trace: one agent observation per prompt, a generation
 * per LLM call with tokens and cost, a tool observation per tool call. Off
 * unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are both set.
 */
export default function langfuseExtension(pi: ExtensionAPI): void {
  const config = langfuseConfig();
  if (!config) return;

  const tracer = createTracer(config);
  const tools = new Map<string, Span>();
  let root: Span | undefined;
  let generation: Span | undefined;
  let context: unknown[] = [];

  pi.on("before_agent_start", (event, ctx) => {
    root = tracer.trace(traceName(event.prompt), {
      input: event.prompt,
      tags: ["testeiya", "cli"],
      sessionId: ctx.sessionManager.getSessionId(),
      metadata: metadata(ctx),
    });
  });

  pi.on("context", (event) => {
    context = event.messages;
  });

  pi.on("message_start", (event) => {
    if (!root) return;
    if (event.message.role !== "assistant") return;
    generation = root.child("llm-generation", { type: "generation", input: context });
  });

  pi.on("message_end", (event) => {
    const message = event.message;
    if (!generation) return;
    if (message.role !== "assistant") return;
    generation.end({
      model: message.model,
      output: message.content,
      usage: {
        input: message.usage.input,
        output: message.usage.output,
        cache_read_input_tokens: message.usage.cacheRead,
        cache_creation_input_tokens: message.usage.cacheWrite,
        total: message.usage.totalTokens,
      },
      cost: {
        input: message.usage.cost.input,
        output: message.usage.cost.output,
        cache_read_input_tokens: message.usage.cost.cacheRead,
        cache_creation_input_tokens: message.usage.cost.cacheWrite,
        total: message.usage.cost.total,
      },
    });
    generation = undefined;
  });

  pi.on("tool_execution_start", (event) => {
    if (!root) return;
    tools.set(event.toolCallId, root.child(event.toolName, { type: "tool", input: event.args }));
  });

  pi.on("tool_execution_end", (event) => {
    const span = tools.get(event.toolCallId);
    if (!span) return;
    const fields: SpanFields = { output: event.result, level: "DEFAULT" };
    if (event.isError) fields.level = "ERROR";
    span.end(fields);
    tools.delete(event.toolCallId);
  });

  pi.on("agent_end", (event) => {
    root?.update({ output: finalText(event.messages) });
  });

  // The only point pi guarantees is terminal: retries and queued continuations
  // are done, and the CLI's own prompt call waits for this handler to finish.
  pi.on("agent_settled", async () => {
    for (const span of tools.values()) span.end();
    tools.clear();
    generation?.end();
    generation = undefined;
    root?.end();
    root = undefined;
    await tracer.flush();
  });
}

function metadata(ctx: ExtensionContext): Record<string, unknown> {
  const value: Record<string, unknown> = { cwd: ctx.cwd, version: VERSION };
  if (ctx.model) value.model = `${ctx.model.provider}/${ctx.model.id}`;
  if (process.env.TESTOMATIO_PROJECT_ID) value.project = process.env.TESTOMATIO_PROJECT_ID;
  return value;
}

// A `/skill` in the task is expanded in front of it, so the first line of what
// the agent reads is the skill, not the job. The trace is named after the job.
function traceName(prompt: string): string {
  let task = prompt;
  const skillEnd = prompt.lastIndexOf("</skill>");
  if (skillEnd !== -1) task = prompt.slice(skillEnd + "</skill>".length);
  const firstLine = task
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "testeiya run";
  if (firstLine.length <= 60) return firstLine;
  return `${firstLine.slice(0, 60)}…`;
}

function finalText(messages: Array<{ role: string; content?: unknown }>): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "assistant") return textOf(message.content);
  }
  return undefined;
}

function textOf(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .filter((part) => part?.type === "text")
    .map((part) => part.text)
    .join("\n");
}
