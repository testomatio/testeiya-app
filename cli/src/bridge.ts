/**
 * Transforms Testeiya (Pi SDK) AgentSessionEvent into Vercel AI SDK-compatible JSON messages.
 * Returns null for events that should be skipped.
 */
export function transformEvent(event: any, messageId: string): Record<string, any> | null {
  switch (event.type) {
    case "agent_start":
      return { type: "start", messageId };

    case "message_update":
      return transformMessageUpdate(event, messageId);

    case "tool_execution_start":
      return {
        type: "tool-input-available",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.args,
      };

    // Live tool progress (bash streams its output tail through this). Each
    // event carries the full accumulated tail, so the client replaces, never
    // appends. Sent as a non-standard `tool-output-partial` message.
    case "tool_execution_update":
      return {
        type: "tool-output-partial",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        output: stringifyResult(event.partialResult),
      };

    case "tool_execution_end": {
      if (event.isError) {
        return {
          type: "tool-output-available",
          toolCallId: event.toolCallId,
          isError: true,
          output: `Error: ${stringifyResult(event.result)}`,
        };
      }
      // Widget tools return their card payload via `details.widget` (see
      // webui/tools/widget-result.ts) — the model only sees the ack in
      // `content`, the UI renders the payload.
      const widget = event.result?.details?.widget;
      return {
        type: "tool-output-available",
        toolCallId: event.toolCallId,
        isError: false,
        output:
          widget !== undefined
            ? JSON.stringify(widget)
            : stringifyResult(event.result),
      };
    }

    case "turn_start":
      return { type: "start-step" };

    case "turn_end":
      return { type: "finish-step" };

    case "agent_end":
      if (event.isTerminal === false) return null;
      return { type: "finish" };

    default:
      return null;
  }
}

function transformMessageUpdate(event: any, messageId: string): Record<string, any> | null {
  const msg = event.assistantMessageEvent;
  if (!msg) return null;

  switch (msg.type) {
    case "text_start":
      return { type: "text-start", id: messageId };

    case "text_delta":
      return { type: "text-delta", id: messageId, delta: msg.delta };

    case "text_end":
      return { type: "text-end", id: messageId };

    case "thinking_start":
      return { type: "reasoning-start", id: messageId };

    case "thinking_delta":
      return { type: "reasoning-delta", id: messageId, delta: msg.delta };

    case "thinking_end":
      return { type: "reasoning-end", id: messageId };

    default:
      return null;
  }
}

/**
 * Convert a persisted SDK conversation transcript (AgentMessage[]) into the UI's
 * ChatMessage[] shape so a resumed conversation renders the same as a live one.
 */
export function historyToChatMessages(messages: any[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg?.role === "user") {
      const content = stripInjectedContext(textOf(msg.content));
      if (content) out.push({ id: `hist_${i}`, role: "user", content });
      continue;
    }
    if (msg?.role === "assistant") {
      out.push(assistantToChatMessage(msg, i));
      continue;
    }
    if (msg?.role === "toolResult") {
      attachToolResult(out, msg);
    }
  }
  return out;
}

function assistantToChatMessage(msg: any, index: number): ChatMessage {
  const parts = Array.isArray(msg.content) ? msg.content : [];
  const text = parts
    .filter((p: any) => p?.type === "text")
    .map((p: any) => p.text ?? "")
    .join("");
  const thinking = parts
    .filter((p: any) => p?.type === "thinking")
    .map((p: any) => p.thinking ?? p.text ?? "")
    .join("");
  const tools: ToolCall[] = parts
    .filter((p: any) => p?.type === "toolCall")
    .map((p: any) => ({
      toolCallId: p.id,
      toolName: p.name,
      input: p.arguments ?? {},
      state: "input-available",
    }));
  // Preserve the true thinking↔text↔tool ordering from the transcript so a
  // resumed turn renders like a live one — reasoning inline where it happened,
  // not merged into one block; consecutive thinking parts grouped.
  const orderedParts: MessagePart[] = [];
  for (const p of parts) {
    if (p?.type === "thinking") {
      const content = p.thinking ?? p.text ?? "";
      if (!content) continue;
      const last = orderedParts[orderedParts.length - 1];
      if (last?.type === "reasoning") {
        last.content = `${last.content}\n\n${content}`;
        continue;
      }
      orderedParts.push({ type: "reasoning", content, isStreaming: false });
    }
    if (p?.type === "text" && (p.text ?? "")) orderedParts.push({ type: "text", text: p.text });
    if (p?.type === "toolCall") orderedParts.push({ type: "tool", toolCallId: p.id });
  }

  const message: ChatMessage = { id: `hist_${index}`, role: "assistant", content: text };
  if (thinking) message.reasoning = { content: thinking, isStreaming: false };
  if (tools.length > 0) message.tools = tools;
  if (orderedParts.length > 0) message.parts = orderedParts;
  return message;
}

function attachToolResult(out: ChatMessage[], msg: any): void {
  for (let i = out.length - 1; i >= 0; i--) {
    const tool = out[i].tools?.find((t) => t.toolCallId === msg.toolCallId);
    if (!tool) continue;
    const widget = msg.details?.widget;
    if (widget !== undefined && !msg.isError) {
      tool.output = JSON.stringify(widget);
    } else {
      tool.output = stringifyResult(msg.content);
    }
    tool.state = msg.isError ? "output-error" : "output-available";
    return;
  }
}

/**
 * Strip server-injected context blocks that are appended to a prompt — e.g.
 * `<browser_state>…</browser_state>` (and any future `<tag …>…</tag>` we add) —
 * so they never leak into a conversation title or a replayed user bubble.
 * Removes both leading (legacy prepended sessions) and trailing (current
 * appended) runs of paired-tag blocks. The trailing match is generic, so a user
 * message that legitimately ends with its own paired XML/markup tag will lose
 * that trailing tag here — the same tradeoff the leading match already accepts.
 */
export function stripInjectedContext(text: string): string {
  return text
    .replace(/^(?:\s*<([a-zA-Z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>\s*)+/, "")
    .replace(/(?:\s*<([a-zA-Z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>\s*)+$/, "")
    .trim();
}

function textOf(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p: any) => p?.type === "text")
    .map((p: any) => p.text ?? "")
    .join("");
}

function stringifyResult(result: any): string {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    return result
      .filter((item: any) => !isUiNotice(item))
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text;
        return JSON.stringify(item);
      })
      .join("\n");
  }
  if (Array.isArray(result?.content)) return stringifyResult(result.content);
  return JSON.stringify(result);
}

// The webui extension appends a model-facing "[UI notice …]" text item to MCP
// list results; forwarding it corrupts the JSON the client parses for the
// expanded tool card's table.
function isUiNotice(item: any): boolean {
  if (item?.type !== "text" || typeof item.text !== "string") return false;
  return item.text.trimStart().startsWith("[UI notice");
}

interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  state: "input-available" | "output-available" | "output-error";
}

type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool"; toolCallId: string }
  | { type: "reasoning"; content: string; isStreaming: boolean; duration?: number };

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: MessagePart[];
  reasoning?: { content: string; isStreaming: boolean; duration?: number };
  tools?: ToolCall[];
}
