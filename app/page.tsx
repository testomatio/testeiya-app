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
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
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
  richViewMode,
  renderRichTool,
} from "@/components/ai-elements/tool";
import { ToolGroup } from "@/components/ai-elements/tool-group";
import { RenderFrame } from "@/components/ai-elements/render-frame";
import { FolderGlyph, MdiIcon } from "@/components/icons";
import { mdiDockLeft } from "@mdi/js";
import AskQuestionRenderer from "@/components/agent-output/AskQuestionRenderer";
import { MessageActions } from "@/components/ai-elements/message-actions";
import { AgentStatusBar } from "@/components/ai-elements/agent-status-bar";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTestClaw } from "@/hooks/use-testclaw";
import type { ChatStatus as TestClawStatus, ToolCall } from "@/hooks/use-testclaw";
import { useHost } from "@/lib/host-bridge";
import { Trash, CircleDotIcon, SettingsIcon, SunIcon, MoonIcon, KeyRoundIcon, ChevronDownIcon } from "lucide-react";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ProvidersDialog } from "@/components/ProvidersDialog";
import { useTheme } from "@/lib/theme";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace/WorkspaceContext";
import { PanelProvider, usePanel } from "@/lib/panel/PanelContext";
import { SidebarPanel } from "@/components/panel/SidebarPanel";
import { MarkdownEditor } from "@/components/workspace/MarkdownEditor";
import { Suspense, useState, useCallback, useMemo, useEffect, type FormEvent, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { readCachedAuthState, createProjectSession } from "@/lib/testomatio-auth";
import { toast } from "sonner";

// `ask_question` is the only tool pinned to the bottom of the message
// (it's interactive — the user reacts to it). Everything else — rich
// renders, MCP list auto-renders, routine tools — appears IN-PLACE in
// tool-call order so each datum is anchored to the reasoning around it.
function isAskQuestion(tool: ToolCall): boolean {
  return tool.toolName === "ask_question";
}

/** Rich-view tools: `render_*` customs + MCP `*_list` auto-renders. */
function isRenderish(tool: ToolCall): boolean {
  return !isAskQuestion(tool) && richViewMode(tool.toolName) !== null;
}

/** Routine tool: anything that isn't a render and isn't the question. */
function isRoutineTool(tool: ToolCall): boolean {
  return !isAskQuestion(tool) && !isRenderish(tool);
}

type Segment =
  | { kind: "routine-solo"; tool: ToolCall }
  | { kind: "routine-group"; tools: ToolCall[] }
  | { kind: "render"; tool: ToolCall; isLatest: boolean };

/**
 * Single in-order pass through a message's tools. Routine tools batched
 * into collapsible groups; render-ish tools emitted as individual segments
 * so they keep their position in the narrative. `ask_question` is dropped
 * here — page.tsx renders it separately, pinned to the message bottom.
 */
function segmentTools(tools: ToolCall[], isStreaming: boolean): Segment[] {
  // Find the index of the LAST render-ish tool so we can expand just that
  // one when the message has finished streaming.
  let lastRenderIdx = -1;
  for (let i = tools.length - 1; i >= 0; i--) {
    if (isRenderish(tools[i])) {
      lastRenderIdx = i;
      break;
    }
  }

  const out: Segment[] = [];
  let buf: ToolCall[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    if (buf.length === 1) out.push({ kind: "routine-solo", tool: buf[0] });
    else out.push({ kind: "routine-group", tools: buf });
    buf = [];
  };
  tools.forEach((t, idx) => {
    if (isAskQuestion(t)) return; // handled at message bottom
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

function renderSegments(
  segments: Segment[],
  renderRoutine: (tool: ToolCall) => ReactNode,
  renderRender: (tool: ToolCall, isLatest: boolean) => ReactNode
): ReactNode {
  return segments.map((seg, idx) => {
    if (seg.kind === "routine-solo") return renderRoutine(seg.tool);
    if (seg.kind === "render") return renderRender(seg.tool, seg.isLatest);
    // routine-group
    const running = seg.tools.some(
      (t) => t.state !== "output-available" && t.state !== "output-error"
    );
    const firstId = seg.tools[0].toolCallId;
    return (
      <ToolGroup
        key={`group-${firstId}-${idx}`}
        count={seg.tools.length}
        summary={summarizeTools(seg.tools)}
        running={running}
      >
        {seg.tools.map((t) => renderRoutine(t))}
      </ToolGroup>
    );
  });
}

const suggestions = [
  "Analyze my test suite for coverage gaps",
  "Find flaky or redundant tests",
  "Suggest new test cases for this project",
  "Review test quality and best practices",
];

// Map our status to the ChatStatus type expected by PromptInputSubmit
function toChatStatus(
  status: TestClawStatus
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
  const workspaceSessionId = searchParams.get("session") ?? null;
  // `ws=1` is set when a Testomat.io project is opened, so the just-loaded
  // markdown is shown straight away instead of behind a closed sidebar.
  const openWorkspace = searchParams.get("ws") === "1";
  return (
    <WorkspaceProvider sessionId={workspaceSessionId}>
      <PanelProvider defaultOpen={openWorkspace} defaultSection="workspace">
        <ChatPage />
      </PanelProvider>
    </WorkspaceProvider>
  );
}

function ChatPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectIds = searchParams.getAll("projectIds");
  const sessionId = searchParams.get("session") ?? undefined;

  const params = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (projectIds.length > 0) p.projectIds = projectIds;
    if (sessionId) p.sessionId = sessionId;
    return Object.keys(p).length > 0 ? p : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds.join(","), sessionId]);

  const { messages, status, model, cwd, mcpTools, expectedMcpServers, mcpLoaded, activeTool, error, sendMessage, stop, clearSession, clearError } =
    useTestClaw(params);
  const host = useHost();
  const isDev = host?.railsEnv === "development" || !host?.isEmbedded;
  const [text, setText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const { theme, toggle: toggleTheme, locked: themeLocked } = useTheme();
  const panel = usePanel();

  // The header shows the live session model once a session is created (the WS
  // `session_created` event sets `model`). Before any prompt there's no live
  // model yet, so fall back to the configured selection from /api/providers so
  // the header always reflects the current provider/model. Refetched whenever
  // the Providers dialog opens/closes so a new selection shows immediately.
  const [configModel, setConfigModel] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/providers", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.current?.provider && d.current.model) {
          setConfigModel(`${d.current.provider}/${d.current.model}`);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [providersOpen]);

  // Embedded hosts (and the dev-embed simulation with a default project slug)
  // supply their own project context, so only a standalone desktop/web instance
  // connects to Testomat.io itself. The connect dialog is the single place that
  // probes connection status (it can be slow on large accounts) — the empty
  // state stays status-agnostic so it never blocks or fires duplicate calls.
  const isEmbedded =
    host?.isEmbedded ??
    (typeof window !== "undefined" && window.parent !== window);
  const canConnectTestomatio = !isEmbedded && !host?.projectSlug;

  // Auto-restore the last opened project on a fresh load (no session in the
  // URL) when the account is already connected — so reopening the app lands you
  // straight in your project instead of the connect dialog. Falls back to the
  // connect prompt if there's no cached project or restoring fails.
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (sessionId || !canConnectTestomatio) return;
    const cached = readCachedAuthState();
    const last = cached?.selectedProjectId;
    if (!cached?.connected || !last) return;
    let cancelled = false;
    setRestoring(true);
    createProjectSession(last)
      .then(({ sessionId: id }) => {
        if (!cancelled) router.replace(`/?session=${encodeURIComponent(id)}&ws=1`);
      })
      .catch(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, canConnectTestomatio, router]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!message.text.trim()) return;
      if (status === "streaming" || status === "submitted") return;

      sendMessage(message.text);
      setText("");
    },
    [sendMessage, status]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      if (status === "streaming" || status === "submitted") return;
      sendMessage(suggestion);
    },
    [sendMessage, status]
  );

  const handleClear = useCallback(() => {
    clearSession();
    toast.success("Session cleared");
  }, [clearSession]);

  const workspace = useWorkspace();
  // A file opened from the sidebar fills the content area and hides the chat;
  // an agent-opened file stays a strip above the (still-visible) chat.
  const fileFullHeight =
    !!workspace.openFile && !!workspace.sessionId && !!workspace.openFile.fullHeight;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            onClick={panel.togglePanel}
            title={panel.open ? "Hide panel" : "Show panel"}
            aria-label="Toggle panel"
          >
            <MdiIcon path={mdiDockLeft} className="size-4" />
          </Button>
          <h1 className="font-semibold text-lg shrink-0">TestClaw</h1>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-muted-foreground text-xs shrink-0"
            onClick={() => setProvidersOpen(true)}
            title="Change provider / model"
            aria-label="Providers and models"
          >
            {model || configModel || "Select model"}
            <ChevronDownIcon className="size-3" />
          </Button>
          {status === "connecting" && (
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs shrink-0">
              <Spinner className="size-3" /> Connecting...
            </span>
          )}
          {status === "ready" && model && (
            <CircleDotIcon className="size-3 text-green-500 shrink-0" />
          )}
          {isDev && cwd && (
            <span
              className="text-muted-foreground/80 text-[11px] font-mono truncate max-w-[360px]"
              title={`cwd: ${cwd}${
                mcpLoaded
                  ? `\nMCP tools: ${mcpTools.length}\n${mcpTools.join(", ")}`
                  : expectedMcpServers.length > 0
                    ? `\nMCP servers pending (connect on first prompt): ${expectedMcpServers.join(", ")}`
                    : "\nNo MCP servers configured for this session"
              }`}
            >
              <FolderGlyph className="inline size-3 mr-1 align-[-1px]" />
              {cwd}
              {mcpLoaded && mcpTools.length > 0 && (
                <span className="ml-2 text-emerald-500">· MCP:{mcpTools.length}</span>
              )}
              {mcpLoaded && mcpTools.length === 0 && (
                <span className="ml-2 text-red-500">· MCP:failed</span>
              )}
              {!mcpLoaded && expectedMcpServers.length > 0 && (
                <span className="ml-2 text-amber-500">· MCP:pending ({expectedMcpServers.length})</span>
              )}
              {!mcpLoaded && expectedMcpServers.length === 0 && (
                <span className="ml-2 text-muted-foreground">· MCP:—</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            disabled={messages.length === 0}
            onClick={handleClear}
            size="sm"
            variant="ghost"
          >
            <Trash className="size-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
          {!themeLocked && (
            <Button
              onClick={toggleTheme}
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <SunIcon className="size-4" />
              ) : (
                <MoonIcon className="size-4" />
              )}
            </Button>
          )}
          <Button
            onClick={() => setSettingsOpen(true)}
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon className="size-4" />
          </Button>
        </div>
      </div>

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
                  setProvidersOpen(true);
                  clearError();
                }}
              >
                Open Providers
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        cwd={cwd}
      />

      <ProvidersDialog open={providersOpen} onOpenChange={setProvidersOpen} />

      {/* Below-header region: the multi-section sidebar panel + chat column. */}
      <div className="flex flex-1 min-h-0">
        <SidebarPanel />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Open-file editor panel — pinned above the chat when active.
              Opened either by clicking a file in the tree or when the agent
              writes a file. */}
          {workspace.openFile && workspace.sessionId && (
            <div
              className={
                fileFullHeight
                  ? "flex min-h-0 flex-1 p-2"
                  : "border-b bg-muted/20 p-2"
              }
            >
              <MarkdownEditor
                key={workspace.openFile.key}
                sessionId={workspace.sessionId}
                path={workspace.openFile.path}
                initialContent={workspace.openFile.initialContent}
                readOnly={status === "streaming" || status === "submitted"}
                onClose={workspace.close}
                onSaved={() => workspace.triggerRefresh()}
                fillHeight={fileFullHeight}
                onToggleFullScreen={() =>
                  workspace.setFullHeight(!workspace.openFile?.fullHeight)
                }
                className={fileFullHeight ? "min-w-0 flex-1" : undefined}
              />
            </div>
          )}

      {/* Chat area — hidden while a file is open full-height (kept mounted so
          state is preserved when the editor is closed). */}
      <Conversation className={fileFullHeight ? "hidden" : "flex-1"}>
        <ConversationContent>
          {messages.length === 0 && canConnectTestomatio && !sessionId && (
            restoring ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Spinner className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Restoring your last project…
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <KeyRoundIcon className="size-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Connect a Testomat.io project</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Authorize TestClaw to load your projects and work with your
                    tests — or just start chatting below.
                  </p>
                </div>
                <Button onClick={() => panel.openSection("project")}>
                  <KeyRoundIcon className="size-4" />
                  Connect Testomat.io
                </Button>
              </div>
            )
          )}
          {messages.map((message) => (
            <Message
              className="max-w-[85%]"
              from={message.role}
              key={message.id}
            >
              {/* Reasoning — collapsed by default; click the trigger to expand. */}
              {message.reasoning && (
                <Reasoning
                  isStreaming={message.reasoning.isStreaming}
                  duration={message.reasoning.duration}
                  defaultOpen={false}
                >
                  <ReasoningTrigger />
                  <ReasoningContent>
                    {message.reasoning.content}
                  </ReasoningContent>
                </Reasoning>
              )}

              {/* Tools — rendered in tool-call order so the narrative stays
                  coherent. Routine tools (bash/read/find/…) batch into
                  collapsible groups; rich renders (render_* + MCP auto-
                  rendered lists) show in-place as collapsed RenderFrames,
                  with only the LAST one auto-expanded (and only after the
                  message has finished streaming). `ask_question` is
                  rendered separately below the text. */}
              {(() => {
                const tools = message.tools ?? [];
                const isLastMessage =
                  messages[messages.length - 1]?.id === message.id;
                const isStreaming =
                  isLastMessage &&
                  (status === "streaming" || status === "submitted");
                const segments = segmentTools(tools, isStreaming);

                const renderRoutine = (tool: ToolCall): ReactNode => (
                  <div key={tool.toolCallId}>
                    <Tool>
                      <ToolHeader
                        title={tool.toolName}
                        type="dynamic-tool"
                        toolName={tool.toolName}
                        state={tool.state}
                      />
                      <ToolContent>
                        <ToolInput input={tool.input} />
                        {tool.output != null && (
                          <ToolOutput
                            output={tool.output}
                            toolName={tool.toolName}
                            errorText={
                              tool.state === "output-error"
                                ? tool.output
                                : undefined
                            }
                          />
                        )}
                      </ToolContent>
                    </Tool>
                  </div>
                );

                const renderRender = (
                  tool: ToolCall,
                  isLatest: boolean
                ): ReactNode => {
                  const rich = renderRichTool(
                    tool.toolName,
                    tool.input,
                    tool.output
                  );
                  if (!rich) return null;
                  return (
                    <RenderFrame
                      key={tool.toolCallId}
                      icon={rich.header.icon}
                      title={rich.header.title}
                      tag={
                        rich.header.tag ? (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {rich.header.tag}
                          </span>
                        ) : undefined
                      }
                      defaultOpen={isLatest}
                    >
                      {rich.body}
                    </RenderFrame>
                  );
                };

                return renderSegments(segments, renderRoutine, renderRender);
              })()}

              {/* Text content */}
              {message.content && (
                <MessageContent>
                  <MessageResponse>{message.content}</MessageResponse>
                  {message.role === "assistant" && (
                    <MessageActions content={message.content} className="mt-1" />
                  )}
                </MessageContent>
              )}

              {/* `ask_question` pinned to the bottom — it's the only
                  interactive tool and sits below the agent's explanation. */}
              {(message.tools ?? []).filter(isAskQuestion).map((tool) => {
                const q = tool.input as {
                  question?: string;
                  options?: string[];
                } | undefined;
                if (!q?.question || !Array.isArray(q.options)) return null;
                const myIdx = messages.findIndex((mm) => mm.id === message.id);
                const laterUserMsg =
                  myIdx >= 0 &&
                  messages
                    .slice(myIdx + 1)
                    .some((mm) => mm.role === "user");
                return (
                  <AskQuestionRenderer
                    key={tool.toolCallId}
                    question={q.question}
                    options={q.options}
                    answered={laterUserMsg}
                    onPick={(opt) => sendMessage(opt)}
                  />
                );
              })}
            </Message>
          ))}

          {/* Loading indicator */}
          {status === "submitted" &&
            messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Shimmer as="span">Thinking...</Shimmer>
              </div>
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <div className={`grid shrink-0 gap-3 border-t p-4${fileFullHeight ? " hidden" : ""}`}>
        <AgentStatusBar status={status} activeTool={activeTool} onStop={stop} />

        {messages.length === 0 && (
          <Suggestions>
            {suggestions.map((s) => (
              <Suggestion
                key={s}
                onClick={handleSuggestionClick}
                suggestion={s}
              />
            ))}
          </Suggestions>
        )}

        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              onChange={(e) => setText(e.target.value)}
              value={text}
              placeholder="Ask TestClaw about your tests..."
            />
          </PromptInputBody>
          <PromptInputFooter>
            <p className="text-muted-foreground text-xs">
              {text.length > 0 ? `${text.length} chars` : ""}
            </p>
            <PromptInputSubmit status={toChatStatus(status)} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
        </div>
      </div>
    </div>
  );
}
