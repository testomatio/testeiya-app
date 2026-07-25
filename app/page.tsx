"use client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { AttachmentDialog } from "@/components/AttachmentDialog";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  ToolTerminal,
  richViewMode,
  renderRichTool,
} from "@/components/ai-elements/tool";
import { extractList } from "@/components/widgets/extract-list";
import { ToolGroup } from "@/components/ai-elements/tool-group";
import { TodoWriteRenderer } from "@/components/agent-output/TodoWriteRenderer";
import AskQuestionRenderer from "@/components/agent-output/AskQuestionRenderer";
import { MessageActions } from "@/components/ai-elements/message-actions";
import { AgentStatusBar } from "@/components/ai-elements/agent-status-bar";
import { ChatStatusBar } from "@/components/ChatStatusBar";
import { WorkflowPrompts } from "@/components/workflows/WorkflowPrompts";
import { WorkflowsDiagramDialog } from "@/components/workflows/WorkflowsDiagramDialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTesteiya } from "@/hooks/use-testeiya";
import type { ChatStatus as TesteiyaStatus, TesteiyaParams, ToolCall, ChatMessage, MessagePart } from "@/hooks/use-testeiya";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { useHost } from "@/lib/host-bridge";
import { useTheme } from "@/lib/theme";
import { Icon, KeyRoundIcon, ChevronDownIcon, PaperclipIcon, FileIcon, XIcon, SparklesIcon, MicIcon, PlayIcon, ListChecksIcon } from "@/lib/icons";
import { ProvidersDialog } from "@/components/ProvidersDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { TestomatioLogin } from "@/components/TestomatioLogin";
import { SkillsMenu } from "@/components/SkillsMenu";
import { useFileMentions } from "@/components/ai-elements/prompt-input-mentions";
import type { MentionItem } from "@/components/ai-elements/prompt-input-mentions";
import { observer } from "mobx-react-lite";
import {
  ServicesProvider,
  useWorkspaceService,
  useProjectService,
  useProvidersService,
  useConnectionsService,
  useWidgetService,
  useSessionsService,
  useChatTabsService,
  useWorkflowsService,
  useSkillsService,
  useDebugLogService,
} from "@/lib/services/StoreProvider";
import { PanelProvider, usePanel } from "@/lib/panel/PanelContext";
import { WidgetCommandProvider, useWidgetBus } from "@/lib/widgets/command-bus";
import { serializeActiveWidget, widgetContextLabel } from "@/lib/widgets/widget-actions";
import type { WidgetDescriptor } from "@/lib/services/widget-service";
import type { TreeNode } from "@/lib/services/types";
import { SidebarPanel } from "@/components/panel/SidebarPanel";
import { WidgetPane } from "@/components/panel/WidgetPane";
import { ChatColumn } from "@/components/panel/ChatColumn";
import { ChatPanelHeader } from "@/components/panel/ChatPanelHeader";
import { MarkdownEditor } from "@/components/workspace/MarkdownEditor";
import { SearchResults } from "@/components/workspace/SearchResults";
import { ResourceWidgetView } from "@/components/widgets/ResourceWidgetView";
import ManualRunRenderer from "@/components/widgets/items/ManualRunRenderer";
import { Suspense, useState, useCallback, useMemo, useEffect, useRef, forwardRef, useImperativeHandle, type ClipboardEvent, type ComponentType, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSearchParams, useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { toast } from "sonner";

// `ask_question` is the only tool pinned to the bottom of the message
// (it's interactive — the user reacts to it). Everything else — rich
// renders, routine tools (incl. MCP `*_list`, collapsed) — appears IN-PLACE
// in tool-call order so each datum is anchored to the reasoning around it.
function isAskQuestion(tool: ToolCall): boolean {
  return tool.toolName === "ask_question";
}

// The agent rewrites its plan via repeated `todo_write` calls; they're folded
// into a single persistent panel instead of one card each.
function isTodoWrite(tool: ToolCall): boolean {
  return tool.toolName === "todo_write";
}

/** Rich-view tools: the explicit `render_*` customs (+ write/edit). */
function isRenderish(tool: ToolCall): boolean {
  return !isAskQuestion(tool) && richViewMode(tool.toolName) !== null;
}


type Segment =
  | { kind: "text"; text: string; index: number }
  | { kind: "reasoning"; content: string; isStreaming: boolean; duration?: number; hasOutput: boolean; index: number }
  | { kind: "ask"; tool: ToolCall }
  | { kind: "routine-solo"; tool: ToolCall }
  | { kind: "routine-group"; tools: ToolCall[] }
  | { kind: "render"; tool: ToolCall; isLatest: boolean }
  | { kind: "todo"; tool: ToolCall; running: boolean; current: boolean };

/**
 * Single in-order pass through a message's tools. Routine tools batched
 * into collapsible groups; render-ish tools emitted as individual segments
 * so they keep their position in the narrative. `ask_question` is dropped
 * here — page.tsx renders it separately, pinned to the message bottom.
 */
function segmentTools(
  tools: ToolCall[],
  isStreaming: boolean,
  isCurrentTodo: boolean
): Segment[] {
  // Find the index of the LAST render-ish tool so we can expand just that
  // one when the message has finished streaming.
  let lastRenderIdx = -1;
  for (let i = tools.length - 1; i >= 0; i--) {
    if (isRenderish(tools[i])) {
      lastRenderIdx = i;
      break;
    }
  }

  // All todo_write calls collapse into one panel showing the latest successful
  // state (each call's output carries the full plan); a still-running call keeps
  // the last good list and flags "running".
  let lastTodo: ToolCall | null = null;
  let lastTodoWithOutput: ToolCall | null = null;
  for (const t of tools) {
    if (!isTodoWrite(t)) continue;
    lastTodo = t;
    if (t.state === "output-available") lastTodoWithOutput = t;
  }
  const todoTool = lastTodoWithOutput ?? lastTodo;
  const todoRunning =
    !!lastTodo &&
    lastTodo.state !== "output-available" &&
    lastTodo.state !== "output-error";

  const out: Segment[] = [];
  let buf: ToolCall[] = [];
  let todoEmitted = false;
  const flush = () => {
    if (buf.length === 0) return;
    if (buf.length === 1) out.push({ kind: "routine-solo", tool: buf[0] });
    else out.push({ kind: "routine-group", tools: buf });
    buf = [];
  };
  tools.forEach((t, idx) => {
    if (isAskQuestion(t)) return; // handled at message bottom
    if (isTodoWrite(t)) {
      if (todoEmitted || !todoTool) return; // one persistent panel per message
      flush();
      out.push({
        kind: "todo",
        tool: todoTool,
        running: todoRunning,
        current: isCurrentTodo,
      });
      todoEmitted = true;
      return;
    }
    if (isRenderish(t)) {
      flush();
      out.push({
        kind: "render",
        tool: t,
        isLatest: idx === lastRenderIdx && !isStreaming,
      });
      return;
    }
    buf.push(t);
  });
  flush();
  return out;
}

/**
 * Order-preserving pass over a message's `parts` (text + tool calls, as the
 * model emitted them). Text lands as its own segment where it occurred, so
 * intent text stays above the tools and the final answer below them. Tool
 * grouping mirrors `segmentTools`, but a text block also breaks a routine run.
 */
function segmentParts(
  parts: MessagePart[],
  tools: ToolCall[],
  isStreaming: boolean,
  isCurrentTodo: boolean
): Segment[] {
  const byId = new Map(tools.map((t) => [t.toolCallId, t]));

  let lastRenderId: string | null = null;
  for (let i = tools.length - 1; i >= 0; i--) {
    if (isRenderish(tools[i])) {
      lastRenderId = tools[i].toolCallId;
      break;
    }
  }

  let lastTodo: ToolCall | null = null;
  let lastTodoWithOutput: ToolCall | null = null;
  for (const t of tools) {
    if (!isTodoWrite(t)) continue;
    lastTodo = t;
    if (t.state === "output-available") lastTodoWithOutput = t;
  }
  const todoTool = lastTodoWithOutput ?? lastTodo;
  const todoRunning =
    !!lastTodo &&
    lastTodo.state !== "output-available" &&
    lastTodo.state !== "output-error";

  const out: Segment[] = [];
  let buf: ToolCall[] = [];
  let todoEmitted = false;
  let textIndex = 0;
  let reasoningIndex = 0;
  const flush = () => {
    if (buf.length === 0) return;
    if (buf.length === 1) out.push({ kind: "routine-solo", tool: buf[0] });
    else out.push({ kind: "routine-group", tools: buf });
    buf = [];
  };
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.type === "reasoning") {
      flush();
      if (part.content.trim()) {
        out.push({
          kind: "reasoning",
          content: part.content,
          isStreaming: part.isStreaming,
          duration: part.duration,
          // Collapse once the model moved on (a later part exists); the live
          // trailing block stays open while it streams and while tools that
          // belong to it are still the newest thing.
          hasOutput: i < parts.length - 1,
          index: reasoningIndex++,
        });
      }
      continue;
    }
    if (part.type === "text") {
      flush();
      if (part.text.trim()) out.push({ kind: "text", text: part.text, index: textIndex++ });
      continue;
    }
    const t = byId.get(part.toolCallId);
    if (!t) continue;
    if (isAskQuestion(t)) {
      // Rendered in place (not pinned to the bottom) so the agent's post-answer
      // reply, which now sits in `parts` after it, reads below the question.
      flush();
      out.push({ kind: "ask", tool: t });
      continue;
    }
    if (isTodoWrite(t)) {
      if (todoEmitted || !todoTool) continue; // one persistent panel per message
      flush();
      out.push({ kind: "todo", tool: todoTool, running: todoRunning, current: isCurrentTodo });
      todoEmitted = true;
      continue;
    }
    if (isRenderish(t)) {
      flush();
      out.push({ kind: "render", tool: t, isLatest: t.toolCallId === lastRenderId && !isStreaming });
      continue;
    }
    buf.push(t);
  }
  flush();
  return out;
}

function summarizeTools(tools: ToolCall[]): string {
  // Compact run-length encoding — "read×3, bash, find" style
  const out: string[] = [];
  let i = 0;
  while (i < tools.length) {
    const name = tools[i].toolName;
    let j = i + 1;
    while (j < tools.length && tools[j].toolName === name) j++;
    out.push(j - i > 1 ? `${name}×${j - i}` : name);
    i = j;
  }
  return out.join(" · ");
}

// What to show next to a routine tool's name. The `task` tool spawns a subagent
// — surface which one ("agent: explore"). Otherwise prefer the model's short
// intent label `_i`; when it's absent fall back to the most identifying input
// field — the command for bash, the file path for read/write/edit, the pattern
// for grep/find — so the row is never just a bare tool name. Paths are shown
// relative to the workspace `cwd` to keep them short and readable.
function routineDescription(tool: ToolCall, cwd?: string | null): string | undefined {
  const input = tool.input;
  if (tool.toolName === "task" && typeof input.agent === "string" && input.agent.trim()) {
    return `agent: ${input.agent}`;
  }
  if (typeof input._i === "string" && input._i.trim()) return relativizePath(input._i, cwd);
  for (const field of ["command", "cmd", "file_path", "path", "pattern", "glob", "query", "tql", "url"]) {
    const value = input[field];
    if (typeof value === "string" && value.trim()) return relativizePath(value, cwd);
  }
  return undefined;
}

function relativizePath(value: string, cwd?: string | null): string {
  if (!cwd) return value;
  if (value === cwd) return ".";
  const prefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
  if (value.startsWith(prefix)) return value.slice(prefix.length);
  return value;
}

function renderSegments(
  segments: Segment[],
  renderRoutine: (tool: ToolCall) => ReactNode,
  renderRender: (tool: ToolCall, isLatest: boolean) => ReactNode,
  renderAsk: (tool: ToolCall) => ReactNode
): ReactNode {
  return segments.map((seg, idx) => {
    if (seg.kind === "text") {
      return (
        <MessageContent key={`text-${seg.index}`}>
          <MessageResponse>{seg.text}</MessageResponse>
        </MessageContent>
      );
    }
    if (seg.kind === "reasoning") {
      return (
        <Reasoning
          key={`reasoning-${seg.index}`}
          isStreaming={seg.isStreaming}
          hasOutput={seg.hasOutput}
          duration={seg.duration}
        >
          <ReasoningTrigger />
          <ReasoningContent>{seg.content}</ReasoningContent>
        </Reasoning>
      );
    }
    if (seg.kind === "ask") return renderAsk(seg.tool);
    if (seg.kind === "routine-solo") return renderRoutine(seg.tool);
    if (seg.kind === "render") return renderRender(seg.tool, seg.isLatest);
    if (seg.kind === "todo") {
      // Stable key (one per message) so the panel updates in place rather than
      // remounting as later todo_write calls supply newer state.
      return (
        <TodoWriteRenderer
          key="todo"
          tool={seg.tool}
          running={seg.running}
          current={seg.current}
        />
      );
    }
    // routine-group
    const running = seg.tools.some(
      (t) => t.state !== "output-available" && t.state !== "output-error"
    );
    const streaming = seg.tools.some(
      (t) => t.state === "input-available" && t.streamOutput
    );
    const firstId = seg.tools[0].toolCallId;
    return (
      <ToolGroup
        key={`group-${firstId}-${idx}`}
        count={seg.tools.length}
        summary={summarizeTools(seg.tools)}
        running={running}
        autoOpen={streaming}
      >
        {seg.tools.map((t) => renderRoutine(t))}
      </ToolGroup>
    );
  });
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Map our status to the ChatStatus type expected by PromptInputSubmit
function toChatStatus(
  status: TesteiyaStatus
): "ready" | "submitted" | "streaming" | "error" {
  if (status === "connecting") return "submitted";
  return status;
}

export default function Home() {
  return (
    <Suspense>
      <ChatWithWorkspace />
    </Suspense>
  );
}

function ChatWithWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceSessionId = searchParams.get("session") ?? null;
  // `ws=1` is set when a Testomat.io project is opened, so the just-loaded
  // markdown is shown straight away instead of behind a closed sidebar.
  const openWorkspace = searchParams.get("ws") === "1";
  // Services switch sessions through the app router (no full reload). Cold-load
  // services (openDefault / restoreLast) can call this from mount effects that
  // fire before the App Router's action queue is initialized — router.replace()
  // then throws "Router action dispatched before initialization". Catch that and
  // retry on the next frame, by which point the router is ready.
  const navigate = useCallback(
    (sessionId: string) => {
      const url = `/?session=${encodeURIComponent(sessionId)}&ws=1`;
      const run = () => {
        try {
          router.replace(url);
        } catch {
          requestAnimationFrame(run);
        }
      };
      run();
    },
    [router]
  );
  return (
    <ServicesProvider sessionId={workspaceSessionId} navigate={navigate}>
      <PanelProvider defaultOpen={openWorkspace} defaultSection="workspace">
        <WidgetCommandProvider>
          <ChatPage />
        </WidgetCommandProvider>
      </PanelProvider>
    </ServicesProvider>
  );
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { status, onStop, onSubmit, onPaste, onAttachClick, onInsertSkill, skillsDisabled, modelLabel, onModelClick, mentionFiles, mentionSkills, sessionId, voiceEnabled },
  ref
) {
  const [text, setText] = useState("");
  const mentions = useFileMentions({ text, setText, items: mentionFiles, skills: mentionSkills });
  const { chatOpen } = usePanel();
  const voice = useVoiceInput({
    sessionId,
    onSegment: (seg) =>
      setText((prev) => (prev.trimEnd() ? `${prev.trimEnd()} ${seg}` : seg)),
  });
  const stopVoice = voice.stop;

  useEffect(() => {
    if (!chatOpen) stopVoice(true);
  }, [chatOpen, stopVoice]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => setText(""),
      insertSkill: (name: string) =>
        setText((prev) => {
          const base = prev.trimEnd();
          if (!base) return `/${name} `;
          return `${base} /${name} `;
        }),
    }),
    []
  );

  let micTooltip = "Voice input";
  if (!voiceEnabled) micTooltip = "Connect a Testomat.io project to use voice input";
  else if (voice.isListening) micTooltip = "Stop recording";

  return (
    <div className="relative">
    <PromptInput onSubmit={(message, event) => { voice.stop(true); return onSubmit(message, event); }}>
      <PromptInputBody>
        <PromptInputTextarea
          onChange={mentions.onChange}
          onKeyDown={mentions.onKeyDown}
          onBlur={mentions.onBlur}
          onPaste={onPaste}
          value={text}
          placeholder="Ask Testeiya about your tests..."
        />
      </PromptInputBody>
      <PromptInputFooter>
        <div className="flex items-center gap-1">
          <SkillsMenu onInsert={onInsertSkill} disabled={skillsDisabled} />
          <PromptInputButton
            onClick={onAttachClick}
            tooltip="Attach files"
            aria-label="Attach files"
          >
            <PaperclipIcon className="size-4" />
          </PromptInputButton>
        </div>
        <div className="flex items-center gap-1">
          {voice.isListening && (
            <span className="flex items-center gap-1.5 text-xs text-destructive animate-pulse select-none">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-destructive" />
              </span>
              Listening...
            </span>
          )}
          {!voice.isListening && voice.isTranscribing && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
              <Spinner className="size-3" />
              Transcribing...
            </span>
          )}
          <Tooltip>
            <TooltipTrigger render={
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-muted-foreground text-xs shrink-0"
                onClick={onModelClick}
                aria-label="Change provider / model"
              >
                {modelLabel}
                <ChevronDownIcon className="size-3" />
              </Button>
            } />
            <TooltipContent side="top"><p>Change provider / model</p></TooltipContent>
          </Tooltip>
          <div className="relative">
            {voice.isListening && (
              <span className="absolute inset-0 rounded-md animate-ping bg-destructive/20" />
            )}
            <PromptInputButton
              onClick={() => {
                if (!voiceEnabled) {
                  toast.error("Connect a Testomat.io project to use voice input");
                  return;
                }
                voice.toggle();
              }}
              tooltip={micTooltip}
              aria-label={micTooltip}
              className={cn(
                !voiceEnabled && "opacity-50",
                voice.isListening && "relative text-destructive bg-destructive/10 hover:bg-destructive/20"
              )}
            >
              <MicIcon className="size-4" />
            </PromptInputButton>
          </div>
          <PromptInputSubmit status={status} onStop={onStop} />
        </div>
      </PromptInputFooter>
    </PromptInput>
      {mentions.dropdown}
    </div>
  );
});

// One conversation message. Extracted + `observer`-wrapped so that during
// streaming only the active (changing) message re-renders per delta — finished
// messages keep the same `message` reference and `isStreaming=false`, so the
// memo `observer` applies skips them. `observer` (not plain `React.memo`) is
// required because the rich-tool chip reads the observable `widget.current` to
// highlight the active widget; a plain memo would freeze that highlight.
const MessageItem = observer(function MessageItem({
  message,
  isStreaming,
  isLastTodo,
  cwd,
  widget,
  onAnswer,
}: MessageItemProps) {
  const segments = useMemo(() => {
    const tools = message.tools ?? [];
    if (message.parts?.length) return segmentParts(message.parts, tools, isStreaming, isLastTodo);
    return segmentTools(tools, isStreaming, isLastTodo);
  }, [message.parts, message.tools, isStreaming, isLastTodo]);

  const renderRoutine = (tool: ToolCall): ReactNode => {
    // Live output tail (bash streams while it runs) — auto-open the card so
    // the terminal is visible; it collapses back once the tool finishes
    // unless the user toggled it manually.
    const streamingOutput =
      tool.state === "input-available" ? tool.streamOutput : undefined;
    // MCP `*_list` output parses into the rich table — shown inside the
    // collapsed card in place of the raw JSON when the user expands it.
    const rich =
      tool.state === "output-available"
        ? renderRichTool(tool.toolName, tool.input, tool.output)
        : null;
    return (
      <div key={tool.toolCallId}>
        <Tool defaultOpen={!!streamingOutput}>
          <ToolHeader
            title={tool.toolName}
            type="dynamic-tool"
            toolName={tool.toolName}
            state={tool.state}
            description={routineDescription(tool, cwd)}
          />
          <ToolContent>
            {tool.toolName === "bash" ? (
              // One terminal block: `$ command` prompt line + its output,
              // remaining params (cwd, timeout, …) behind the ⓘ badge.
              <ToolTerminal
                command={String(tool.input.command ?? "")}
                info={tool.input}
                output={streamingOutput ?? tool.output ?? ""}
                isStreaming={!!streamingOutput}
              />
            ) : (
              <>
                <ToolInput input={tool.input} />
                {streamingOutput && (
                  <ToolTerminal output={streamingOutput} isStreaming />
                )}
                {rich ? (
                  <div className="px-1 pb-1">{rich.body}</div>
                ) : (
                  tool.output != null && (
                    <ToolOutput
                      output={tool.output}
                      toolName={tool.toolName}
                      errorText={
                        tool.state === "output-error" ? tool.output : undefined
                      }
                    />
                  )
                )}
              </>
            )}
          </ToolContent>
        </Tool>
      </div>
    );
  };

  // Rich renders live in the widget pane; the chat keeps a compact chip at
  // the narrative spot that re-opens that widget. Charts are the exception:
  // they are part of the narrative itself and render inline in the chat.
  const renderRender = (tool: ToolCall): ReactNode => {
    const rich = renderRichTool(tool.toolName, tool.input, tool.output);
    // An unparseable rich payload must still leave a trace in the chat —
    // fall back to the plain tool card instead of vanishing.
    if (!rich) return renderRoutine(tool);
    if (tool.toolName === "render_chart") {
      return <div key={tool.toolCallId}>{rich.body}</div>;
    }
    const active =
      widget.current?.source === "tool" &&
      widget.current.key === tool.toolCallId;
    return (
      <button
        key={tool.toolCallId}
        type="button"
        onClick={() =>
          widget.show({
            source: "tool",
            key: tool.toolCallId,
            toolName: tool.toolName,
            input: tool.input,
            output: tool.output,
          })
        }
        className={cn(
          "my-1 flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
          active ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50"
        )}
      >
        <span className="shrink-0 text-muted-foreground">
          {rich.header.icon}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {rich.header.title}
        </span>
        {rich.header.tag && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {rich.header.tag}
          </span>
        )}
        <span className="shrink-0 text-[10px] text-muted-foreground">
          View →
        </span>
      </button>
    );
  };

  const renderAsk = (tool: ToolCall): ReactNode => {
    const q = tool.input as {
      question?: string;
      options?: string[];
      multiSelect?: boolean;
      recommended?: number[];
    } | undefined;
    if (!q?.question || !Array.isArray(q.options)) return null;
    return (
      <AskQuestionRenderer
        key={tool.toolCallId}
        question={q.question}
        options={q.options}
        multiSelect={q.multiSelect}
        recommended={q.recommended}
        answered={tool.state !== "input-available"}
        selected={tool.output}
        dismissed={tool.state === "output-error"}
        onPick={(opt) => onAnswer(tool.toolCallId, opt)}
      />
    );
  };

  return (
    <Message className="max-w-[85%]" from={message.role}>
      {/* `/<skill>` command banner — shows which skill drove this reply. */}
      {message.skill && (
        <div className="mb-2 inline-flex max-w-full items-center gap-2.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <SparklesIcon className="size-4 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold leading-none text-primary">Using skill: {message.skill.name}</span>
            {message.skill.description && (
              <span className="truncate leading-none text-muted-foreground">{message.skill.description}</span>
            )}
          </div>
        </div>
      )}

      {/* Attached files — thumbnails for images, chips for other files. */}
      {message.files && message.files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {message.files.map((f, i) =>
            f.mediaType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={f.dataUrl}
                alt={f.filename}
                className="max-h-40 rounded-md border object-contain"
              />
            ) : (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"
              >
                <FileIcon className="size-4 text-muted-foreground" />
                <span className="max-w-[160px] truncate">
                  {f.filename}
                </span>
              </div>
            )
          )}
        </div>
      )}

      {/* Legacy merged reasoning — only for parts-less messages; with ordered
          parts each reasoning block renders inline via renderSegments, in the
          position the model emitted it. */}
      {message.reasoning && !message.parts?.some((p) => p.type === "reasoning") && (
        <Reasoning
          isStreaming={message.reasoning.isStreaming}
          hasOutput={!!message.content}
          duration={message.reasoning.duration}
        >
          <ReasoningTrigger />
          <ReasoningContent>
            {message.reasoning.content}
          </ReasoningContent>
        </Reasoning>
      )}

      {/* Text, tools, and ask_question cards — interleaved in the exact order
          the model emitted them, so intent text leads and the answer trails. */}
      {renderSegments(segments, renderRoutine, renderRender, renderAsk)}

      {/* Answered `ask_question` — only for parts-less (legacy) messages; with
          ordered parts the ask card renders inline above via renderSegments. */}
      {!message.parts?.length && (message.tools ?? [])
        .filter(isAskQuestion)
        .filter((tool) => tool.state !== "input-available")
        .map(renderAsk)}

      {/* Text content — with ordered `parts`, the message's text is already
          interleaved above by renderSegments (intent first, answer last), so
          only the copy action trails here. Parts-less messages (user bubbles,
          legacy history) keep their single trailing content block. */}
      {!message.parts?.length && message.content && (
        <MessageContent>
          <MessageResponse>{message.content}</MessageResponse>
          {message.role === "assistant" && (
            <MessageActions content={message.content} className="mt-1" />
          )}
        </MessageContent>
      )}
      {!!message.parts?.length && message.role === "assistant" && message.content && (
        <MessageActions content={message.content} className="mt-1" />
      )}

      {/* Pending `ask_question` pinned to the bottom — the only interactive
          tool; keep it reachable while it awaits an answer. Parts messages
          render it inline (it's the last part, so already at the bottom). */}
      {!message.parts?.length && (message.tools ?? [])
        .filter(isAskQuestion)
        .filter((tool) => tool.state === "input-available")
        .map(renderAsk)}
    </Message>
  );
});

/**
 * The app shell: sidebar, widget pane, global dialogs, and the chat column
 * hosting one mounted ChatView per open tab. Inactive views are hidden with
 * CSS so their WebSocket, streaming, and local state stay alive — that's what
 * makes parallel chats and instant switching work.
 */
const ChatPage = observer(function ChatPage() {
  const searchParams = useSearchParams();
  const projectIds = searchParams.getAll("projectIds");
  const sessionId = searchParams.get("session") ?? undefined;

  const widget = useWidgetService();
  const tabs = useChatTabsService();
  const host = useHost();
  const workspace = useWorkspaceService();
  const project = useProjectService();
  const providers = useProvidersService();
  const [switchProjectOpen, setSwitchProjectOpen] = useState(false);
  const isDev = host?.railsEnv === "development" || !host?.isEmbedded;

  const params = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (projectIds.length > 0) p.projectIds = projectIds;
    if (sessionId) p.sessionId = sessionId;
    return Object.keys(p).length > 0 ? p : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds.join(","), sessionId]);

  // Keep the header's provider/model label in sync — refresh when the Providers
  // dialog opens/closes so a new selection shows immediately. (The live session
  // model from the WS still takes precedence once a session exists.)
  useEffect(() => {
    void providers.refresh();
  }, [providers, providers.dialogOpen]);

  // Embedded hosts (and the dev-embed simulation with a default project slug)
  // supply their own project context, so only a standalone desktop/web instance
  // connects to Testomat.io itself. The connect dialog is the single place that
  // probes connection status (it can be slow on large accounts) — the empty
  // state stays status-agnostic so it never blocks or fires duplicate calls.
  const isEmbedded =
    host?.isEmbedded ??
    (typeof window !== "undefined" && window.parent !== window);
  const canConnectTestomatio = !isEmbedded && !host?.projectSlug;

  // Cold load (no session): a configured TESTEIYA_WORKSPACE takes precedence, so
  // open it first and only reopen the last project when no default workspace was
  // opened. Sequencing keeps restoreLast from clobbering the default workspace.
  useEffect(() => {
    if (sessionId) return;
    void (async () => {
      const opened = await workspace.openDefault();
      if (opened || !canConnectTestomatio) return;
      void project.restoreLast();
    })();
  }, [sessionId, canConnectTestomatio, workspace, project]);

  const openProviders = useCallback(() => providers.setDialogOpen(true), [providers]);
  const openSwitchProject = useCallback(() => setSwitchProjectOpen(true), []);

  const activeTab = tabs.activeTab;
  const cwd = activeTab?.cwd ?? null;
  const mcpTools = activeTab?.mcpTools ?? [];
  const expectedMcpServers = activeTab?.expectedMcpServers ?? [];
  const mcpLoaded = activeTab?.mcpLoaded ?? false;
  const activeBusy =
    activeTab?.status === "streaming" || activeTab?.status === "submitted";

  const widgetBody = (() => {
    const current = widget.current;
    if (!current) return null;
    if (current.source === "tool") {
      const rich = renderRichTool(
        current.toolName,
        current.input,
        current.output,
        current.key
      );
      if (!rich) return null;
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <span className="shrink-0 text-muted-foreground">
              {rich.header.icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {rich.header.title}
            </span>
            {rich.header.tag && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {rich.header.tag}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 shrink-0 p-0"
              onClick={() => widget.clear()}
              aria-label="Close widget"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
          <div
            key={current.key}
            className="min-h-0 flex-1 overflow-auto p-3"
          >
            {rich.body}
          </div>
        </div>
      );
    }
    if (current.source === "manual-run") {
      const run = project.activeManualRun;
      if (!run) return null;
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
          <ManualRunRenderer
            data={run}
            onExit={() => project.closeManualRun()}
            widgetId={current.key}
          />
        </div>
      );
    }
    if (current.source === "resource") {
      const url = project.currentLinks?.[current.resource];
      return (
        <div className="flex min-h-0 flex-1">
          <ResourceWidgetView
            resource={current.resource}
            widgetId={current.key}
            externalUrl={url}
            onOpenExternal={() => url && project.openExternal(url)}
            onRefresh={() => project.refresh()}
            onClose={() => project.closeResource()}
            className="min-w-0 flex-1"
          />
        </div>
      );
    }
    if (current.source === "file") {
      const file = workspace.openFile;
      const sid = workspace.sessionId;
      if (!file || !sid) return null;
      return (
        <div className="flex min-h-0 flex-1">
          <MarkdownEditor
            key={file.key}
            sessionId={sid}
            path={file.path}
            initialContent={file.initialContent}
            scrollToText={file.scrollToText}
            reloadToken={workspace.fileReloadToken}
            readOnly={activeBusy}
            onClose={workspace.close}
            onSaved={() => workspace.markChanged(file.path)}
            fillHeight
            className="min-w-0 flex-1"
          />
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1">
        <SearchResults className="min-w-0 flex-1" />
      </div>
    );
  })();
  const hasWidget = widgetBody !== null;

  return (
    <div className="flex h-full flex-col">
      <CommandPalette />

      <ProvidersDialog
        open={providers.dialogOpen}
        onOpenChange={providers.setDialogOpen}
      />

      <WorkflowsDiagramDialog />

      <TestomatioLogin
        open={switchProjectOpen}
        onOpenChange={setSwitchProjectOpen}
      />

      {/* Below-header region: sidebar | widget pane | chat column. */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <SidebarPanel cwd={cwd} onSwitchProject={openSwitchProject} onOpenProviders={openProviders} />
        <WidgetPane fill>{widgetBody}</WidgetPane>
        <ChatColumn hasWidget={hasWidget}>
          <ChatPanelHeader
            canCollapse={hasWidget}
            mcpStatus={
              isDev && cwd && (
            <span className="flex items-center text-[11px] font-mono">
              {mcpLoaded && mcpTools.length > 0 && (
                <Tooltip>
                  <TooltipTrigger render={
                    <span className="text-run-passed">MCP:{mcpTools.length}</span>
                  } />
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-semibold mb-1">{mcpTools.length} tools across {Object.keys(mcpTools.reduce<Record<string, number>>((acc, t) => { const server = t.split("_").slice(0, 3).join("_"); acc[server] = (acc[server] ?? 0) + 1; return acc; }, {})).length} servers</p>
                    <ul className="space-y-0.5">
                      {Object.entries(mcpTools.reduce<Record<string, number>>((acc, t) => { const server = t.split("_").slice(0, 3).join("_"); acc[server] = (acc[server] ?? 0) + 1; return acc; }, {})).map(([server, count]) => (
                        <li key={server} className="flex items-center justify-between gap-4 font-mono text-xs">
                          <span className="text-muted-foreground">{server}</span>
                          <span className="text-foreground">{count}</span>
                        </li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              )}
              {mcpLoaded && mcpTools.length === 0 && (
                <Tooltip>
                  <TooltipTrigger render={
                    <span className="text-run-failed">MCP:failed</span>
                  } />
                  <TooltipContent side="bottom">
                    <p className="font-semibold">MCP failed to load</p>
                    <p className="text-xs text-muted-foreground">No tools available. Check MCP server config.</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {!mcpLoaded && expectedMcpServers.length > 0 && (
                <Tooltip>
                  <TooltipTrigger render={
                    <span className="text-run-skipped">MCP:pending ({expectedMcpServers.length})</span>
                  } />
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-semibold mb-1">Pending MCP servers: {expectedMcpServers.length}</p>
                    <p className="text-xs text-muted-foreground mb-1">Will connect on first prompt</p>
                    <ul className="space-y-0.5">
                      {expectedMcpServers.map((s) => (
                        <li key={s} className="font-mono text-xs text-muted-foreground">{s}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              )}
              {!mcpLoaded && expectedMcpServers.length === 0 && (
                <Tooltip>
                  <TooltipTrigger render={
                    <span className="text-muted-foreground">MCP:—</span>
                  } />
                  <TooltipContent side="bottom">
                    <p className="font-semibold">MCP not configured</p>
                    <p className="text-xs text-muted-foreground">No MCP servers found for this workspace.</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </span>
              )
            }
          />
          {tabs.tabs.map((tab) => (
            <ChatView
              key={tab.key}
              tabKey={tab.key}
              isActive={tab.key === tabs.activeKey}
              params={params}
              sessionId={sessionId}
              canConnectTestomatio={canConnectTestomatio}
              onOpenProviders={openProviders}
              onOpenSwitchProject={openSwitchProject}
            />
          ))}
        </ChatColumn>
      </div>
    </div>
  );
});

/**
 * One chat tab: owns its own agent WebSocket (useTesteiya) and everything
 * per-conversation — transcript, prompt input, attachments, error banner.
 * Stays mounted while inactive (`hidden`) so a background chat keeps
 * streaming; effects that drive app-wide singletons (widget pane, sidebar MCP
 * status, session handlers, workflow runner) are gated on `isActive`.
 */
const ChatView = observer(function ChatView({
  tabKey,
  isActive,
  params,
  sessionId,
  canConnectTestomatio,
  onOpenProviders,
  onOpenSwitchProject,
}: ChatViewProps) {
  const { theme } = useTheme();
  const widget = useWidgetService();
  // Serialize the widget the user is currently viewing (id + its declared
  // actions + title) so it rides every prompt and the agent can drive it via
  // ui_widget. A drilled-in detail (a single run, the manual-run executor)
  // overrides the reported kind/title via activeOverride, so the agent and the
  // chat context chip name the specific item — not the list it came from. The
  // user can remove it from context (the chip's X) — then nothing is sent.
  const widgetTitle = widget.activeOverride?.title ?? widgetTitleFor(widget.current);
  const widgetExtra = {
    kind: widget.activeOverride?.kind,
    state: widget.activeOverride?.state,
    title: widgetTitle,
    id: widget.activeOverride?.id,
  };
  const activeWidget = widget.contextDismissed
    ? undefined
    : serializeActiveWidget(widget.current, widgetExtra) ?? undefined;
  const contextLabel = widget.contextDismissed
    ? null
    : widgetContextLabel(widget.current, widgetExtra);
  let ContextIcon: ComponentType<{ className?: string }> = ListChecksIcon;
  if (contextLabel && /^(run|manual run)/i.test(contextLabel)) ContextIcon = PlayIcon;
  if (widget.current?.source === "file") ContextIcon = FileIcon;

  const paramsWithContext = useMemo(
    () => (activeWidget ? { ...(params ?? {}), activeWidget } : params),
    [params, activeWidget]
  );

  const { messages, status, model, cwd, mcpTools, expectedMcpServers, mcpLoaded, activeTool, error, currentConversationId, sendMessage, answerQuestion, sendWidgetResult, stop, clearSession, openConversation, clearError } =
    useTesteiya(paramsWithContext);
  const bus = useWidgetBus();
  const tabs = useChatTabsService();
  const chatInputRef = useRef<ChatInputHandle>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState<string | null>(null);
  const panel = usePanel();
  const workflows = useWorkflowsService();
  const workspace = useWorkspaceService();
  const project = useProjectService();
  const providers = useProvidersService();
  const connections = useConnectionsService();
  const sessions = useSessionsService();
  const skills = useSkillsService();
  const debug = useDebugLogService();
  const mentionFiles = useMemo(() => flattenTree(workspace.tree), [workspace.tree]);
  const mentionSkills = useMemo(
    () =>
      skills.skills.map<MentionItem>((s) => ({
        name: s.name,
        path: s.name,
        kind: "skill",
        description: s.description,
      })),
    [skills.skills]
  );

  // Preload the skills list so the "/" mention popup has data on first keystroke.
  useEffect(() => {
    if (!isActive) return;
    void skills.load();
  }, [isActive, skills, sessionId]);

  // Feed the running session's MCP tools into the connections service so the
  // sidebar can show live connected/disconnected status per server.
  useEffect(() => {
    if (!isActive) return;
    connections.setRuntime(mcpTools, mcpLoaded);
  }, [isActive, connections, mcpTools, mcpLoaded]);

  // The agent's rich renders move out of the chat stream into the widget pane:
  // find the latest completed renderish tool and show it (deduped by toolCallId
  // so a finished render replaces the previous one without churning). Empty list
  // renders are skipped so a no-match agent query never replaces what the user
  // is looking at with a "Nothing matched" dummy.
  const latestRenderTool = useMemo(() => {
    for (let m = messages.length - 1; m >= 0; m--) {
      const tools = messages[m].tools ?? [];
      for (let i = tools.length - 1; i >= 0; i--) {
        const t = tools[i];
        if (t.toolName === "ask_question") continue;
        if (t.toolName === "render_chart") continue;
        if (t.state !== "output-available") continue;
        if (richViewMode(t.toolName) === null) continue;
        if (isEmptyListRender(t.toolName, t.input, t.output)) continue;
        return t;
      }
    }
    return null;
  }, [messages]);
  useEffect(() => {
    if (!isActive) return;
    if (!latestRenderTool) return;
    // Don't let an agent render hijack a widget the user explicitly opened
    // (a resource view, the file editor, a manual run, search) — those stay put;
    // the render is still reachable as a chat stub with its "View →" action.
    if (widget.current && widget.current.source !== "tool") return;
    widget.show({
      source: "tool",
      key: latestRenderTool.toolCallId,
      toolName: latestRenderTool.toolName,
      input: latestRenderTool.input,
      output: latestRenderTool.output,
    });
  }, [isActive, latestRenderTool, widget]);

  // The agent's `ui_widget` tool parks its turn until the client runs the
  // command against the active widget and ships the result back. Dispatch each
  // new ui_widget call into the command bus (the widget's buttons go through the
  // same handler), then return the result; dedupe so each call fires once.
  const handledWidgetCalls = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const message of messages) {
      for (const tool of message.tools ?? []) {
        if (tool.toolName !== "ui_widget") continue;
        if (tool.state !== "input-available") continue;
        if (handledWidgetCalls.current.has(tool.toolCallId)) continue;
        handledWidgetCalls.current.add(tool.toolCallId);
        const input = (tool.input ?? {}) as {
          widget_id?: string;
          action?: string;
          params?: Record<string, unknown>;
        };
        const callId = tool.toolCallId;
        if (!isActive) {
          sendWidgetResult(callId, {
            ok: false,
            error:
              "This chat is in a background tab — the widget pane is not available. Ask the user to switch to this chat.",
          });
          continue;
        }
        // `get` is read-only: hand back the snapshot the active widget published
        // (the rows the user sees) directly, so the agent doesn't re-query the API
        // for on-screen data and a stale command handler can't get in the way.
        if (input.action === "get") {
          const data = widget.snapshot;
          sendWidgetResult(
            callId,
            data == null
              ? { ok: false, error: "This widget exposes no readable contents." }
              : { ok: true, result: data }
          );
          continue;
        }
        void bus
          .dispatch(input.widget_id ?? "", input.action ?? "", input.params ?? {})
          .then((res) => sendWidgetResult(callId, res));
      }
    }
  }, [isActive, messages, bus, sendWidgetResult, widget]);

  // The plan evolves across turns; only the most recent message's todo panel is
  // still relevant, so earlier ones render collapsed.
  const lastTodoMessageId = useMemo(() => {
    for (let m = messages.length - 1; m >= 0; m--) {
      if ((messages[m].tools ?? []).some(isTodoWrite)) return messages[m].id;
    }
    return null;
  }, [messages]);

  const addAttachments = useCallback((files: File[]) => {
    const accepted = files.filter((file) => {
      if (file.size <= MAX_FILE_SIZE) return true;
      toast.error(`${file.name} is too large (max 25 MB)`);
      return false;
    });
    if (accepted.length === 0) return;
    setAttachments((prev) => [
      ...prev,
      ...accepted.map((file) => ({
        id: nanoid(),
        file,
        previewUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined,
      })),
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      for (const a of prev) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      return [];
    });
  }, []);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (const item of items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) pasted.push(file);
      }
      if (pasted.length === 0) return;
      event.preventDefault();
      addAttachments(pasted);
    },
    [addAttachments]
  );

  const handleSubmit = useCallback(
    async (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!message.text.trim() && attachments.length === 0) return;
      if (status === "streaming" || status === "submitted") return;

      const files = await Promise.all(
        attachments.map(async (a) => ({
          filename: a.file.name,
          mediaType: a.file.type || "application/octet-stream",
          dataUrl: await fileToDataUrl(a.file),
        }))
      );
      sendMessage(message.text, files);
      chatInputRef.current?.clear();
      clearAttachments();
    },
    [sendMessage, status, attachments, clearAttachments]
  );

  const runWorkflowPrompt = useCallback(
    (text: string) => {
      if (status === "streaming" || status === "submitted") return;
      sendMessage(text);
      panel.setChatOpen(true);
    },
    [sendMessage, status, panel]
  );

  useEffect(() => {
    if (!isActive) return;
    workflows.setRunner(runWorkflowPrompt);
  }, [isActive, workflows, runWorkflowPrompt]);

  const handleInsertSkill = useCallback((name: string) => {
    chatInputRef.current?.insertSkill(name);
  }, []);

  const handleClear = useCallback(() => {
    clearSession();
    setTimeout(() => toast.success("Session cleared"), 0);
  }, [clearSession]);

  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyN" && e.altKey) {
        e.preventDefault();
        setTimeout(handleClear, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, handleClear]);

  useEffect(() => {
    if (!isActive) return;
    sessions.setHandlers(openConversation, clearSession);
  }, [isActive, sessions, openConversation, clearSession]);

  // Mirror the live conversation id (highlights the active chat) and refresh the
  // list when it changes — a brand-new chat appears once it has output.
  useEffect(() => {
    if (!isActive) return;
    sessions.setActiveId(currentConversationId ?? null);
    void sessions.load();
  }, [isActive, sessions, currentConversationId]);

  // Sync this tab's live state into the tab strip. Reporting `stop` lets
  // ChatTabsService.close() abort a busy tab while its socket is still open —
  // an unmount-time abort would run after the hook already closed the socket.
  useEffect(() => {
    tabs.report(tabKey, {
      status,
      error,
      conversationId: currentConversationId,
      mcpTools,
      expectedMcpServers,
      mcpLoaded,
      cwd,
      stop,
    });
  }, [tabs, tabKey, status, error, currentConversationId, mcpTools, expectedMcpServers, mcpLoaded, cwd, stop]);

  // Refresh project counters + chat list + the open file once each AI turn
  // finishes (the agent may have created/edited tests or runs). Only on a
  // busy→ready edge.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== "ready") return;
    if (prev !== "submitted" && prev !== "streaming") return;
    project.refresh();
    workspace.reloadOpenFile();
    void sessions.load();
  }, [status, project, sessions, workspace]);

  const activeCategory =
    workflows.categories.find((c) => c.id === activeWorkflow) ?? null;

  return (
    <div className={cn("@container flex min-h-0 flex-1 flex-col", !isActive && "hidden")}>
      {error && (
        <div className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="font-medium text-destructive">Agent error</div>
            <div className="break-words text-destructive/90">{error}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/api[ _]?key/i.test(error) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenProviders();
                  clearError();
                }}
              >
                Open Providers
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => void debug.copyLogs()}>
              Copy logs
            </Button>
            <Button size="sm" variant="ghost" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <AttachmentDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        onAdd={addAttachments}
      />

      <div className={cn("flex min-h-0 flex-1 flex-col", messages.length === 0 && "justify-center")}>
      <Conversation className={messages.length === 0 ? "flex-none" : "flex-1"}>
        <ConversationContent className="items-center">
          <div className="flex w-full max-w-[960px] flex-col gap-8 px-4 py-4 @2xl:px-[60px]">
          {messages.length === 0 && (!canConnectTestomatio || sessionId || cwd) && (
            <div className="flex flex-col items-center justify-center gap-6 py-8 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={theme === "dark" ? "/testeiya-logo-dark.svg" : "/testeiya-logo.svg"}
                alt="Testeiya"
                className="h-auto max-h-40 w-auto max-w-full shrink-0 object-contain"
              />
              <div className="space-y-3">
                <p className="text-base text-muted-foreground max-w-md mx-auto">
                  Ask anything about tests, the testing goddess will help you
                </p>
              </div>
              {workflows.categories.length > 0 && (
                <div className="flex w-full flex-col items-center gap-4">
                  <div className="flex max-w-full items-center gap-1.5">
                    <Tabs
                      value={activeCategory?.id ?? ""}
                      onValueChange={(value) => setActiveWorkflow(value as string)}
                      className="items-center"
                    >
                      <TabsList className="h-auto max-w-full flex-wrap">
                        {workflows.categories.map((category) => (
                          <TabsTrigger
                            key={category.id}
                            value={category.id}
                            className="flex-none gap-1.5 px-3 py-1"
                          >
                            <Icon name={category.icon} />
                            {category.title}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 shrink-0 p-0 text-muted-foreground"
                            onClick={() => workflows.setDialogOpen(true)}
                            aria-label="Workflow overview"
                          >
                            <Icon name="more_horiz" className="size-4" />
                          </Button>
                        }
                      />
                      <TooltipContent><p>Workflow overview</p></TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex min-h-9 w-full items-start justify-center">
                    {activeCategory && (
                      <WorkflowPrompts
                        category={activeCategory}
                        onRun={runWorkflowPrompt}
                        streaming={status === "streaming" || status === "submitted"}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {messages.length === 0 && canConnectTestomatio && !sessionId && project.restoring && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Spinner className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Restoring your last project…
              </p>
            </div>
          )}
          {messages.length === 0 && canConnectTestomatio && !sessionId && !project.restoring && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <KeyRoundIcon className="size-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">Connect a Testomat.io project</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Authorize Testeiya to load your projects and work with your
                  tests — or just start chatting below.
                </p>
              </div>
              <Button onClick={onOpenSwitchProject}>
                <KeyRoundIcon className="size-4" />
                Connect Testomat.io
              </Button>
            </div>
          )}
          {messages.map((message, i) => {
            const isStreaming =
              i === messages.length - 1 &&
              (status === "streaming" || status === "submitted");
            return (
              <MessageItem
                key={message.id}
                message={message}
                isStreaming={isStreaming}
                isLastTodo={message.id === lastTodoMessageId}
                cwd={cwd}
                widget={widget}
                onAnswer={answerQuestion}
              />
            );
          })}

          {/* Loading indicator */}
          {status === "submitted" &&
            messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Shimmer as="span">Thinking...</Shimmer>
              </div>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <div className={cn("shrink-0 flex justify-center", (messages.length === 0 && canConnectTestomatio && !sessionId && !cwd) && "hidden")}>
        <div className="grid w-full max-w-[960px] gap-3 px-4 pb-4 @2xl:px-[60px]">
        <AgentStatusBar status={status} activeTool={activeTool} onStop={stop} />

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-md border bg-muted/40 py-1 pr-2 pl-1 text-xs"
              >
                {a.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.previewUrl}
                    alt={a.file.name}
                    className="size-8 rounded object-cover"
                  />
                ) : (
                  <span className="flex size-8 items-center justify-center rounded bg-muted">
                    <FileIcon className="size-4 text-muted-foreground" />
                  </span>
                )}
                <span className="max-w-[140px] truncate">{a.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={`Remove ${a.file.name}`}
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <ChatInput
          ref={chatInputRef}
          status={toChatStatus(status)}
          onStop={stop}
          onSubmit={handleSubmit}
          onPaste={handlePaste}
          onAttachClick={() => setAttachOpen(true)}
          onInsertSkill={handleInsertSkill}
          skillsDisabled={status === "streaming" || status === "submitted"}
          modelLabel={model ? model.split("/").slice(1).join("/") || model : providers.label || "Select model"}
          onModelClick={onOpenProviders}
          mentionFiles={mentionFiles}
          mentionSkills={mentionSkills}
          sessionId={sessionId ?? null}
          voiceEnabled={project.currentProject != null}
        />
        <ChatStatusBar
          cwd={cwd}
          widgetLabel={status === "streaming" || status === "submitted" ? null : contextLabel}
          WidgetIcon={ContextIcon}
          onDismissWidget={() => widget.dismissContext()}
        />
        </div>
      </div>
      </div>
    </div>
  );
});

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function flattenTree(nodes: TreeNode[]): MentionItem[] {
  const out: MentionItem[] = [];
  for (const node of nodes) {
    out.push({ name: node.name, path: node.path, kind: node.kind });
    if (node.children) out.push(...flattenTree(node.children));
  }
  return out;
}

function isEmptyListRender(
  toolName: string | undefined,
  input: unknown,
  output: unknown
): boolean {
  const isList = toolName === "render_list";
  if (!isList) return false;
  const count = Math.max(
    extractList(input).items.length,
    extractList(output).items.length
  );
  return count === 0;
}

function widgetTitleFor(descriptor: WidgetDescriptor | null): string | undefined {
  if (descriptor?.source !== "tool") return undefined;
  return titleOf(descriptor.output) ?? titleOf(descriptor.input);
}

function titleOf(data: unknown): string | undefined {
  const obj = data as { clean_title?: string; title?: string } | null;
  return obj?.clean_title ?? obj?.title;
}

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl?: string;
}

interface ChatInputHandle {
  insertSkill: (name: string) => void;
  clear: () => void;
}

interface ChatInputProps {
  status: ReturnType<typeof toChatStatus>;
  onStop: () => void;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>
  ) => void | Promise<void>;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onAttachClick: () => void;
  onInsertSkill: (name: string) => void;
  skillsDisabled: boolean;
  modelLabel: string;
  onModelClick: () => void;
  mentionFiles: MentionItem[];
  mentionSkills: MentionItem[];
  sessionId: string | null;
  voiceEnabled: boolean;
}

interface MessageItemProps {
  message: ChatMessage;
  isStreaming: boolean;
  isLastTodo: boolean;
  cwd: string | null;
  widget: ReturnType<typeof useWidgetService>;
  onAnswer: (toolCallId: string, value: string) => void;
}

interface ChatViewProps {
  tabKey: string;
  isActive: boolean;
  params: TesteiyaParams | undefined;
  sessionId: string | undefined;
  canConnectTestomatio: boolean;
  onOpenProviders: () => void;
  onOpenSwitchProject: () => void;
}

