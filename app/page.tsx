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
  richViewMode,
  renderRichTool,
} from "@/components/ai-elements/tool";
import { ToolGroup } from "@/components/ai-elements/tool-group";
import { RenderFrame } from "@/components/ai-elements/render-frame";
import AskQuestionRenderer from "@/components/agent-output/AskQuestionRenderer";
import { MessageActions } from "@/components/ai-elements/message-actions";
import { AgentStatusBar } from "@/components/ai-elements/agent-status-bar";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTesteiya } from "@/hooks/use-testeiya";
import type { ChatStatus as TesteiyaStatus, ToolCall } from "@/hooks/use-testeiya";
import { useHost } from "@/lib/host-bridge";
import { Icon, Trash, KeyRoundIcon, ChevronDownIcon, PaperclipIcon, FileIcon, XIcon, SparklesIcon, MicIcon } from "@/lib/icons";
import { ProvidersDialog } from "@/components/ProvidersDialog";
import { TestomatioLogin } from "@/components/TestomatioLogin";
import { SkillsMenu } from "@/components/SkillsMenu";
import { observer } from "mobx-react-lite";
import {
  ServicesProvider,
  useWorkspaceService,
  useSearchService,
  useProjectService,
  useProvidersService,
  useConnectionsService,
} from "@/lib/services/StoreProvider";
import { PanelProvider, usePanel } from "@/lib/panel/PanelContext";
import { SidebarPanel } from "@/components/panel/SidebarPanel";
import { MarkdownEditor } from "@/components/workspace/MarkdownEditor";
import { SearchResults } from "@/components/workspace/SearchResults";
import { ResourceWidgetView } from "@/components/agent-output/ResourceWidgetView";
import { Suspense, useState, useCallback, useMemo, useEffect, useRef, forwardRef, useImperativeHandle, type ClipboardEvent, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSearchParams, useRouter } from "next/navigation";
import { nanoid } from "nanoid";
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
  "Map requirements to existing test cases",
];

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
  // Services switch sessions through the app router (no full reload).
  const navigate = useCallback(
    (sessionId: string) =>
      router.replace(`/?session=${encodeURIComponent(sessionId)}&ws=1`),
    [router]
  );
  return (
    <ServicesProvider sessionId={workspaceSessionId} navigate={navigate}>
      <PanelProvider defaultOpen={openWorkspace} defaultSection="workspace">
        <ChatPage />
      </PanelProvider>
    </ServicesProvider>
  );
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { status, onStop, onSubmit, onPaste, onAttachClick, onInsertSkill, skillsDisabled, modelLabel, onModelClick },
  ref
) {
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<VoiceRecognition | null>(null);

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

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const w = window as VoiceWindow;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;

    if (!Ctor) {
      toast.error("Voice input is not supported in this browser");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "ru-RU";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: VoiceRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setText((prev) => (prev.trimEnd() ? `${prev.trimEnd()} ${transcript}` : transcript));
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening]);

  return (
    <PromptInput onSubmit={onSubmit}>
      <PromptInputBody>
        <PromptInputTextarea
          onChange={(e) => setText(e.target.value)}
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
          {isListening && (
            <span className="flex items-center gap-1.5 text-xs text-destructive animate-pulse select-none">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-destructive" />
              </span>
              Listening...
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
            {isListening && (
              <span className="absolute inset-0 rounded-md animate-ping bg-destructive/20" />
            )}
            <PromptInputButton
              onClick={toggleVoice}
              tooltip={isListening ? "Stop recording" : "Voice input"}
              aria-label={isListening ? "Stop recording" : "Voice input"}
              className={isListening ? "relative text-destructive bg-destructive/10 hover:bg-destructive/20" : undefined}
            >
              <MicIcon className="size-4" />
            </PromptInputButton>
          </div>
          <PromptInputSubmit status={status} onStop={onStop} />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );
});

const ChatPage = observer(function ChatPage() {
  const searchParams = useSearchParams();
  const projectIds = searchParams.getAll("projectIds");
  const sessionId = searchParams.get("session") ?? undefined;

  const params = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (projectIds.length > 0) p.projectIds = projectIds;
    if (sessionId) p.sessionId = sessionId;
    return Object.keys(p).length > 0 ? p : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds.join(","), sessionId]);

  const { messages, status, model, cwd, mcpTools, expectedMcpServers, mcpLoaded, activeTool, error, sendMessage, answerQuestion, stop, clearSession, clearError } =
    useTesteiya(params);
  const host = useHost();
  const isDev = host?.railsEnv === "development" || !host?.isEmbedded;
  const chatInputRef = useRef<ChatInputHandle>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [switchProjectOpen, setSwitchProjectOpen] = useState(false);
  const panel = usePanel();
  const workspace = useWorkspaceService();
  const search = useSearchService();
  const project = useProjectService();
  const providers = useProvidersService();
  const connections = useConnectionsService();

  // Feed the running session's MCP tools into the connections service so the
  // sidebar can show live connected/disconnected status per server.
  useEffect(() => {
    connections.setRuntime(mcpTools, mcpLoaded);
  }, [connections, mcpTools, mcpLoaded]);

  // Keep the header's provider/model label in sync — refresh when the Providers
  // dialog opens/closes so a new selection shows immediately. (The live session
  // model from the WS still takes precedence once a session exists.)
  useEffect(() => {
    void providers.refresh();
  }, [providers, providersOpen]);

  // Embedded hosts (and the dev-embed simulation with a default project slug)
  // supply their own project context, so only a standalone desktop/web instance
  // connects to Testomat.io itself. The connect dialog is the single place that
  // probes connection status (it can be slow on large accounts) — the empty
  // state stays status-agnostic so it never blocks or fires duplicate calls.
  const isEmbedded =
    host?.isEmbedded ??
    (typeof window !== "undefined" && window.parent !== window);
  const canConnectTestomatio = !isEmbedded && !host?.projectSlug;

  // Auto-restore the last opened project on a fresh load (no session) when the
  // account is connected — orchestrated by the project service.
  useEffect(() => {
    if (sessionId || !canConnectTestomatio) return;
    void project.restoreLast();
  }, [sessionId, canConnectTestomatio, project]);

  // Web mode: if the server has a TESTEIYA_WORKSPACE configured, open it on a
  // cold load. No-op when a session exists or none is configured.
  useEffect(() => {
    if (sessionId) return;
    void workspace.openDefault();
  }, [sessionId, workspace]);

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

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      if (status === "streaming" || status === "submitted") return;
      sendMessage(suggestion);
    },
    [sendMessage, status]
  );

  const handleInsertSkill = useCallback((name: string) => {
    chatInputRef.current?.insertSkill(name);
  }, []);

  const handleClear = useCallback(() => {
    clearSession();
    setTimeout(() => toast.success("Session cleared"), 0);
  }, [clearSession]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyN" && e.altKey) {
        e.preventDefault();
        setTimeout(handleClear, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClear]);

  // A file opened from the sidebar fills the content area and hides the chat;
  // an agent-opened file stays a strip above the (still-visible) chat.
  const fileFullHeight =
    !!workspace.openFile && !!workspace.sessionId && !!workspace.openFile.fullHeight;

  // A project resource (tests/runs/plans) opened from the Project section shows
  // its widget full-height in the main area, taking over from the chat.
  const openResource = project.openResource;
  const resourceUrl =
    openResource && project.currentLinks
      ? project.currentLinks[openResource]
      : undefined;
  const hideChat = fileFullHeight || !!openResource || search.showSearch;

  return (
    <div className="flex h-full flex-col">
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

      <ProvidersDialog open={providersOpen} onOpenChange={setProvidersOpen} />

      <TestomatioLogin
        open={switchProjectOpen}
        onOpenChange={setSwitchProjectOpen}
      />

      <AttachmentDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        onAdd={addAttachments}
      />

      {/* Below-header region: the multi-section sidebar panel + chat column. */}
      <div className="flex flex-1 min-h-0">
        <SidebarPanel cwd={cwd} onSwitchProject={() => setSwitchProjectOpen(true)} />
        <div className={`relative flex min-w-0 flex-1 flex-col bg-muted/30${messages.length === 0 ? " justify-center" : ""}`}>
          {/* Project resource widget (tests/runs/plans) — fills the main area,
              fed live from the Testomat.io v2 proxy, using the same widgets the
              agent renders in chat. */}
          {openResource && (
            <div className="flex min-h-0 flex-1 p-2">
              <ResourceWidgetView
                resource={openResource}
                externalUrl={resourceUrl}
                onOpenExternal={() =>
                  resourceUrl && project.openExternal(resourceUrl)
                }
                onClose={() => project.closeResource()}
                className="min-w-0 flex-1"
              />
            </div>
          )}

          {/* Open-file editor panel — pinned above the chat when active.
              Opened either by clicking a file in the tree or when the agent
              writes a file. */}
          {!openResource && workspace.openFile && workspace.sessionId && (
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
                scrollToText={workspace.openFile.scrollToText}
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

          {/* Workspace search results — fills the main area until a result is
              opened (which shows the editor) or the view is closed. */}
          {!openResource && !workspace.openFile && search.showSearch && (
            <div className="flex min-h-0 flex-1 p-2">
              <SearchResults className="min-w-0 flex-1" />
            </div>
          )}

      {/* MCP status + Clear — shown only when there's an active chat */}
      <div className={cn("flex items-center justify-end gap-2 px-3 pt-3", messages.length === 0 && "hidden")}>
          {isDev && cwd && (
            <span className="flex items-center text-[11px] font-mono">
              {mcpLoaded && mcpTools.length > 0 && (
                <Tooltip>
                  <TooltipTrigger render={
                    <span className="text-emerald-500">MCP:{mcpTools.length}</span>
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
                    <span className="text-red-500">MCP:failed</span>
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
                    <span className="text-amber-500">MCP:pending ({expectedMcpServers.length})</span>
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
          )}
          {messages.length > 0 && (
            <Tooltip>
              <TooltipTrigger render={
                <Button
                  onClick={handleClear}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 bg-background/80 text-muted-foreground backdrop-blur-sm hover:bg-muted hover:text-foreground"
                  aria-label="Clear chat"
                >
                  <Trash className="size-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
              } />
              <TooltipContent className="flex items-center gap-2">
                <p>New session</p>
                <kbd className="pointer-events-none inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                  {typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥ Option + N" : "Alt + N"}
                </kbd>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      <Conversation className={hideChat ? "hidden" : messages.length === 0 ? "flex-none" : "flex-1"}>
        <ConversationContent className="items-center">
          <div className="flex w-full max-w-[960px] flex-col gap-8 px-[60px] py-4">
          {messages.length === 0 && (!canConnectTestomatio || sessionId || cwd) && (
            <div className="flex flex-col items-center justify-center gap-6 py-8 text-center">
              <div className="space-y-3">
                <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
                  Test smarter, ship faster
                </h1>
                <p className="text-base text-muted-foreground max-w-md mx-auto">
                  Ask anything about your tests — coverage gaps, flaky cases, quality reviews, or new test ideas.
                </p>
              </div>
              <Suggestions>
                {suggestions.map((s) => (
                  <Suggestion
                    key={s}
                    onClick={handleSuggestionClick}
                    suggestion={s}
                  />
                ))}
              </Suggestions>
            </div>
          )}
          {messages.length === 0 && canConnectTestomatio && !sessionId && (
            project.restoring ? (
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
                    Authorize Testeiya to load your projects and work with your
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

              {/* Reasoning — auto-opens and streams while the model thinks,
                  then auto-collapses ~1s after it finishes. Finished/historical
                  reasoning starts collapsed; click the trigger to expand. */}
              {message.reasoning && (
                <Reasoning
                  isStreaming={message.reasoning.isStreaming}
                  duration={message.reasoning.duration}
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
                return (
                  <AskQuestionRenderer
                    key={tool.toolCallId}
                    question={q.question}
                    options={q.options}
                    answered={tool.state !== "input-available"}
                    selected={tool.output}
                    onPick={(opt) => answerQuestion(tool.toolCallId, opt)}
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
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <div className={hideChat || (messages.length === 0 && canConnectTestomatio && !sessionId && !cwd) ? "hidden shrink-0" : "shrink-0 flex justify-center"}>
        <div className="grid w-full max-w-[960px] gap-3 px-[60px] pb-4">
        <AgentStatusBar status={status} activeTool={activeTool} onStop={stop} />

        {false && (
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
          onModelClick={() => setProvidersOpen(true)}
        />
        </div>
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
}

interface VoiceRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface VoiceRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: VoiceRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

interface VoiceWindow {
  SpeechRecognition?: new () => VoiceRecognition;
  webkitSpeechRecognition?: new () => VoiceRecognition;
}
