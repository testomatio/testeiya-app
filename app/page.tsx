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
import { FolderGlyph, MdiIcon, ProjectGlyph } from "@/components/icons";
import { mdiDockLeft, mdiPageLayoutSidebarLeft } from "@mdi/js";
import AskQuestionRenderer from "@/components/agent-output/AskQuestionRenderer";
import { MessageActions } from "@/components/ai-elements/message-actions";
import { AgentStatusBar } from "@/components/ai-elements/agent-status-bar";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTesteiya } from "@/hooks/use-testeiya";
import type { ChatStatus as TesteiyaStatus, ToolCall } from "@/hooks/use-testeiya";
import { useHost } from "@/lib/host-bridge";
import { Trash, CircleDotIcon, SettingsIcon, SunIcon, MoonIcon, KeyRoundIcon, ChevronDownIcon, ChevronsUpDownIcon, PaperclipIcon, FileIcon, XIcon, SparklesIcon } from "@/lib/icons";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ProvidersDialog } from "@/components/ProvidersDialog";
import { TestomatioLogin } from "@/components/TestomatioLogin";
import { SkillsMenu } from "@/components/SkillsMenu";
import { useTheme } from "@/lib/theme";
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
  { status, onStop, onSubmit, onPaste, onAttachClick },
  ref
) {
  const [text, setText] = useState("");

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
        <PromptInputButton
          onClick={onAttachClick}
          tooltip="Attach files"
          aria-label="Attach files"
        >
          <PaperclipIcon className="size-4" />
        </PromptInputButton>
        <PromptInputSubmit status={status} onStop={onStop} />
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [switchProjectOpen, setSwitchProjectOpen] = useState(false);
  const { theme, toggle: toggleTheme, locked: themeLocked } = useTheme();
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
    toast.success("Session cleared");
  }, [clearSession]);

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
      {/* Header */}
      <div className="flex items-center justify-between border-b pr-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex w-12 shrink-0 items-center justify-center">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={panel.togglePanel}
              title={panel.open ? "Hide panel" : "Show panel"}
              aria-label="Toggle panel"
            >
              <MdiIcon path={panel.open ? mdiDockLeft : mdiPageLayoutSidebarLeft} className="size-4" />
            </Button>
          </div>
          <h1 className="font-semibold text-lg shrink-0">Testeiya</h1>
          {project.currentProject && (
            <div className="flex min-w-0 items-center text-xs">
              <button
                type="button"
                onClick={() => panel.openSection("project")}
                title={`Project: ${project.currentProject.title}\nClick to view in sidebar`}
                className="flex min-w-0 max-w-[260px] items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
              >
                <ProjectGlyph className="size-3.5 shrink-0 text-primary" />
                <span className="truncate font-medium text-foreground">
                  {project.currentProject.title}
                </span>
                {project.currentProject.testsCount !== null && (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    · {project.currentProject.testsCount.toLocaleString()} tests
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSwitchProjectOpen(true)}
                title="Change project"
                aria-label="Change project"
                className="ml-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <ChevronsUpDownIcon className="size-3.5" />
              </button>
            </div>
          )}
          {isDev && cwd && (
            <span className="flex min-w-0 max-w-[360px] items-center text-[11px] font-mono">
              {/* Clicking the path opens a folder picker to switch workspace.
                  The path is truncated from the START so the tail (the actual
                  folder) stays visible. */}
              <button
                type="button"
                onClick={() => void workspace.openFolder()}
                title={`${cwd}\nClick to open another folder`}
                className="flex min-w-0 items-center text-muted-foreground/80 transition-colors hover:text-foreground"
              >
                <FolderGlyph className="inline size-3 mr-1 shrink-0 align-[-1px]" />
                <span className="truncate text-left [direction:rtl]">{cwd}</span>
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-muted-foreground text-xs shrink-0"
            onClick={() => setProvidersOpen(true)}
            title="Change provider / model"
            aria-label="Providers and models"
          >
            {model || providers.label || "Select model"}
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
            <span className="flex items-center text-[11px] font-mono shrink-0">
              {mcpLoaded && mcpTools.length > 0 && (
                <span
                  className="text-emerald-500"
                  title={`MCP tools: ${mcpTools.length}\n${mcpTools.join(", ")}`}
                >
                  MCP:{mcpTools.length}
                </span>
              )}
              {mcpLoaded && mcpTools.length === 0 && (
                <span className="text-red-500">MCP:failed</span>
              )}
              {!mcpLoaded && expectedMcpServers.length > 0 && (
                <span
                  className="text-amber-500"
                  title={`MCP servers pending (connect on first prompt): ${expectedMcpServers.join(", ")}`}
                >
                  MCP:pending ({expectedMcpServers.length})
                </span>
              )}
              {!mcpLoaded && expectedMcpServers.length === 0 && (
                <span className="text-muted-foreground">MCP:—</span>
              )}
            </span>
          )}
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
        <SidebarPanel />
        <div className="flex min-w-0 flex-1 flex-col">
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

      {/* Chat area — hidden while a file or resource widget is open full-height
          (kept mounted so state is preserved when the overlay is closed). */}
      <Conversation className={hideChat ? "hidden" : "flex-1"}>
        {messages.length > 0 && (
          <Button
            onClick={handleClear}
            size="sm"
            variant="ghost"
            className="absolute top-3 right-3 z-10 gap-1.5 bg-background/80 text-muted-foreground backdrop-blur-sm hover:bg-muted hover:text-foreground"
            title="Clear chat"
            aria-label="Clear chat"
          >
            <Trash className="size-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        )}
        <ConversationContent>
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
                <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
                  <SparklesIcon className="size-3.5 shrink-0 text-primary" />
                  <span className="font-medium text-primary">
                    Using skill: {message.skill.name}
                  </span>
                  {message.skill.description && (
                    <span className="truncate text-muted-foreground">
                      — {message.skill.description}
                    </span>
                  )}
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
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <div className={`grid shrink-0 gap-3 border-t p-4${hideChat ? " hidden" : ""}`}>
        <AgentStatusBar status={status} activeTool={activeTool} onStop={stop} />

        {messages.length === 0 && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
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
            <SkillsMenu
              onInsert={handleInsertSkill}
              disabled={status === "streaming" || status === "submitted"}
            />
          </div>
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
}
