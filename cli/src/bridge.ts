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

    case "tool_execution_end":
      return {
        type: "tool-output-available",
        toolCallId: event.toolCallId,
        isError: !!event.isError,
        output: event.isError
          ? `Error: ${stringifyResult(event.result)}`
          : stringifyResult(event.result),
      };

    case "turn_start":
      return { type: "start-step" };

    case "turn_end":
      return { type: "finish-step" };

    case "agent_end":
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
  const message: ChatMessage = { id: `hist_${index}`, role: "assistant", content: text };
  if (thinking) message.reasoning = { content: thinking, isStreaming: false };
  if (tools.length > 0) message.tools = tools;
  return message;
}

function attachToolResult(out: ChatMessage[], msg: any): void {
  for (let i = out.length - 1; i >= 0; i--) {
    const tool = out[i].tools?.find((t) => t.toolCallId === msg.toolCallId);
    if (!tool) continue;
    tool.output = stringifyResult(msg.content);
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
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text;
        return JSON.stringify(item);
      })
      .join("\n");
  }
  return JSON.stringify(result);
}

interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  state: "input-available" | "output-available" | "output-error";
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: { content: string; isStreaming: boolean; duration?: number };
  tools?: ToolCall[];
}
