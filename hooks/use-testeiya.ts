"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logAgentEvent, logWsEvent } from "@/lib/debug/external-log";

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  state: "input-available" | "output-available" | "output-error";
}

export interface AttachedFile {
  filename: string;
  mediaType: string;
  /** base64 data URL — `data:<mime>;base64,...` */
  dataUrl: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: {
    content: string;
    isStreaming: boolean;
    duration?: number;
  };
  tools?: ToolCall[];
  files?: AttachedFile[];
  /** Set when this reply was driven by a `/<skill>` command. */
  skill?: { name: string; description: string };
}

export type ChatStatus = "ready" | "connecting" | "submitted" | "streaming";

export interface TesteiyaParams {
  projectIds?: string[];
  sessionId?: string;
  /** Serialized `<active_widget>` block for the widget the user is viewing.
   *  Rides every prompt (spread into `wsParams`) so the agent can drive it. */
  activeWidget?: string;
  [key: string]: unknown;
}

/**
 * Resolve the agent WebSocket origin. In the desktop/static build the UI is
 * served by the Bun app-server, so the agent socket is same-origin — derive it
 * from `window.location`. An explicit `NEXT_PUBLIC_TESTEIYA_WS_URL` still wins
 * (e.g. dev, where the UI runs under `next dev` and the server is elsewhere).
 */
function getWsBase(): string {
  // Web dev (`next dev`): the UI is served by Next on a different origin than the
  // Bun agent server, so honor the explicit WS URL (e.g. ws://localhost:3210).
  // HTTP `/api/*` is proxied by Next rewrites, but WebSocket upgrades can't be —
  // hence connecting to the agent server directly here.
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_TESTEIYA_WS_URL
  ) {
    return process.env.NEXT_PUBLIC_TESTEIYA_WS_URL;
  }
  // Production/static build: the unified server serves the UI *and* the agent
  // WebSocket on one origin (desktop random port, embedded web), so connect
  // same-origin. This must win over any baked NEXT_PUBLIC_TESTEIYA_WS_URL — the
  // desktop server's port is dynamic, so a baked value would hit a dead port.
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return process.env.NEXT_PUBLIC_TESTEIYA_WS_URL || "ws://localhost:3210";
}

/** No server signal — not even a heartbeat `ping` — for this long means the
 *  socket is dead. Comfortably above the server's HEARTBEAT_MS (15s) so a couple
 *  of dropped frames don't trip it. */
const STALL_TIMEOUT_MS = 45000;

/** How long to wait for the socket to open before treating the connect as
 *  failed. Without this a dead agent server leaves the socket stuck in
 *  CONNECTING and a queued message hangs silently forever. */
const CONNECT_TIMEOUT_MS = 10000;

export function useTesteiya(params?: TesteiyaParams) {
  const wsUrl = useMemo(() => {
    const base = getWsBase();
    if (params?.sessionId) {
      return `${base}?session=${encodeURIComponent(params.sessionId)}`;
    }
    return base;
  }, [params?.sessionId]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [model, setModel] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [mcpTools, setMcpTools] = useState<string[]>([]);
  const [expectedMcpServers, setExpectedMcpServers] = useState<string[]>([]);
  const [mcpLoaded, setMcpLoaded] = useState(false);
  /** SDK conversation id of the live thread — used to highlight it in the
   *  Chats sidebar and refresh the list when it changes. */
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  /** Name of the currently-in-flight tool, or null if none. */
  const [activeTool, setActiveTool] = useState<string | null>(null);
  /** Last error from the agent server (e.g. missing API key). Shown in the UI. */
  const [error, setError] = useState<string | null>(null);
  /** Answered `ask_question` calls, keyed by `toolCallId` → picked option. The
   *  form's per-message tool state is unreliable here (one prompt spans several
   *  assistant messages and `updateLastAssistant` only touches the last one), so
   *  this durable, id-keyed record is the source of truth for "this question is
   *  resolved" regardless of which message re-renders the form. */
  const [answeredQuestions, setAnsweredQuestions] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (!params?.sessionId) return;
    let cancelled = false;
    fetch(`/api/agent/${params.sessionId}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.cwd === "string") setCwd((prev) => prev ?? data.cwd);
        if (Array.isArray(data.expectedMcpServers)) {
          setExpectedMcpServers(data.expectedMcpServers);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [params?.sessionId]);
  const wsRef = useRef<WebSocket | null>(null);
  const contentRef = useRef("");
  const reasoningRef = useRef("");
  const reasoningStartRef = useRef<number>(0);
  const currentMsgIdRef = useRef("");
  const pendingMessageRef = useRef<{ text: string; files?: AttachedFile[] } | null>(null);
  // A conversation the user switched to while the socket was reconnecting; sent
  // as `open_conversation` once it opens so the next prompt resumes that thread.
  const pendingConversationRef = useRef<string | null>(null);
  // A `skill` event arrives just before the reply's `start`; stash it so the
  // new assistant message can carry the "using skill" banner.
  const pendingSkillRef = useRef<{ name: string; description: string } | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  /** Fires only when the socket goes fully silent — no events and no `ping`
   *  heartbeat — for STALL_TIMEOUT_MS, which means the connection is dead, not
   *  that the agent is busy. Turns that silent failure into a visible error. */
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);
  const armWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = setTimeout(() => {
      // The agent server heartbeats every ~15s while it works, so long tool
      // calls and deep thinking keep this re-armed. Reaching here means no
      // signal at all for STALL_TIMEOUT_MS — the socket is dead (a zombie
      // connection can still report OPEN), so drop it and let the next send
      // reconnect. Fires only on a real disconnect, never on a slow turn.
      logWsEvent("ws-stall", `no server events for ${STALL_TIMEOUT_MS}ms`, false);
      setStatus((s) => (s === "submitted" || s === "streaming" ? "ready" : s));
      setError(
        "Lost connection to the agent — your last message may not have finished. Send it again to reconnect."
      );
      wsRef.current?.close();
      wsRef.current = null;
    }, STALL_TIMEOUT_MS);
  }, [clearWatchdog]);

  const updateLastAssistant = useCallback(
    (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const idx = prev.findLastIndex((m) => m.role === "assistant");
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = updater(updated[idx]);
        return updated;
      });
    },
    []
  );

  const updateMessageById = useCallback(
    (id: string, updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        // A delta arrived for an id with no `start` (reconnect, re-entrant
        // agent loop, provider reordering) — lazily create the message so text
        // is never appended to the wrong (previous) bubble.
        if (idx === -1) {
          return [...prev, updater({ id, role: "assistant", content: "" })];
        }
        const updated = [...prev];
        updated[idx] = updater(updated[idx]);
        return updated;
      });
    },
    []
  );

  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }
      logAgentEvent(data);

      // Any server event — including the periodic `ping` heartbeat sent while
      // the agent works — means the connection is alive, so re-arm the stall
      // detector. Disarm on terminal events (the turn ended, or we're idle).
      clearWatchdog();
      const terminal = ["finish", "done", "error", "abort", "session_cleared", "conversation_opened"];
      if (!terminal.includes(data.type as string)) armWatchdog();

      switch (data.type) {
        case "session_created":
          setModel(data.model as string);
          setCwd(typeof data.cwd === "string" ? data.cwd : null);
          setMcpTools(Array.isArray(data.mcpTools) ? (data.mcpTools as string[]) : []);
          setMcpLoaded(true);
          if (typeof data.conversationId === "string") {
            setCurrentConversationId(data.conversationId);
          }
          // If there's a pending message, send it now
          if (pendingMessageRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            const { sessionId: _, ...wsParams } = paramsRef.current || {};
            const pending = pendingMessageRef.current;
            wsRef.current.send(
              JSON.stringify({
                type: "prompt",
                message: pending.text,
                files: pending.files,
                ...wsParams,
              })
            );
            pendingMessageRef.current = null;
          }
          break;

        case "skill":
          pendingSkillRef.current = {
            name: data.name as string,
            description: (data.description as string) ?? "",
          };
          break;

        case "start": {
          currentMsgIdRef.current = data.messageId as string;
          contentRef.current = "";
          reasoningRef.current = "";
          const skill = pendingSkillRef.current ?? undefined;
          pendingSkillRef.current = null;
          setMessages((prev) => [
            ...prev,
            { id: data.messageId as string, role: "assistant", content: "", skill },
          ]);
          setStatus("submitted");
          break;
        }

        case "text-start":
          setStatus("streaming");
          break;

        case "text-delta": {
          const id = (data.id as string) || currentMsgIdRef.current;
          if (id !== currentMsgIdRef.current) {
            currentMsgIdRef.current = id;
            contentRef.current = "";
            reasoningRef.current = "";
          }
          contentRef.current += data.delta as string;
          const text = contentRef.current;
          updateMessageById(id, (msg) => ({ ...msg, content: text }));
          break;
        }

        case "text-end":
          break;

        case "reasoning-start": {
          const id = (data.id as string) || currentMsgIdRef.current;
          if (id !== currentMsgIdRef.current) {
            currentMsgIdRef.current = id;
            contentRef.current = "";
            reasoningRef.current = "";
          }
          reasoningStartRef.current = Date.now();
          updateMessageById(id, (msg) => ({
            ...msg,
            reasoning: { content: "", isStreaming: true },
          }));
          break;
        }

        case "reasoning-delta": {
          const id = (data.id as string) || currentMsgIdRef.current;
          if (id !== currentMsgIdRef.current) {
            currentMsgIdRef.current = id;
            contentRef.current = "";
            reasoningRef.current = "";
          }
          reasoningRef.current += data.delta as string;
          const reasoning = reasoningRef.current;
          updateMessageById(id, (msg) => ({
            ...msg,
            reasoning: { content: reasoning, isStreaming: true },
          }));
          break;
        }

        case "reasoning-end": {
          const id = (data.id as string) || currentMsgIdRef.current;
          const duration = Math.round(
            (Date.now() - reasoningStartRef.current) / 1000
          );
          updateMessageById(id, (msg) => ({
            ...msg,
            reasoning: msg.reasoning
              ? { ...msg.reasoning, isStreaming: false, duration }
              : undefined,
          }));
          break;
        }

        case "tool-input-available": {
          const tool: ToolCall = {
            toolCallId: data.toolCallId as string,
            toolName: data.toolName as string,
            input: data.input as Record<string, unknown>,
            state: "input-available",
          };
          let activeLabel = tool.toolName;
          if (tool.toolName === "task" && typeof tool.input.agent === "string" && tool.input.agent.trim()) {
            activeLabel = `${tool.input.agent} agent`;
          }
          setActiveTool(activeLabel);
          updateLastAssistant((msg) => ({
            ...msg,
            tools: [...(msg.tools || []), tool],
          }));
          break;
        }

        case "tool-output-available": {
          const toolCallId = data.toolCallId as string;
          const output = data.output as string;
          const isError =
            typeof data.isError === "boolean"
              ? data.isError
              : output.startsWith("Error:");
          setActiveTool(null);
          updateLastAssistant((msg) => ({
            ...msg,
            tools: msg.tools?.map((t) =>
              t.toolCallId === toolCallId
                ? {
                    ...t,
                    output,
                    state: isError ? "output-error" : "output-available",
                  }
                : t
            ),
          }));
          break;
        }

        case "finish":
        case "done":
          setStatus("ready");
          setActiveTool(null);
          break;

        case "abort":
          setStatus("ready");
          setActiveTool(null);
          break;

        case "error":
          console.error("Testeiya error:", data.error);
          setError(
            typeof data.error === "string" ? data.error : "Unknown agent error"
          );
          setStatus("ready");
          setActiveTool(null);
          break;

        case "session_cleared":
          setMessages([]);
          setModel(null);
          setCwd(null);
          setMcpTools([]);
          setMcpLoaded(false);
          setAnsweredQuestions({});
          setStatus("ready");
          break;
      }
    },
    [updateLastAssistant, updateMessageById, clearWatchdog, armWatchdog]
  );

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setStatus("connecting");
    const ws = new WebSocket(wsUrl);
    let opened = false;
    const connectTimer = setTimeout(() => {
      if (ws.readyState !== WebSocket.CONNECTING) return;
      logWsEvent("ws-connect-timeout", wsUrl, false);
      ws.close();
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      opened = true;
      clearTimeout(connectTimer);
      logWsEvent("ws-open", wsUrl, true);
      setStatus("ready");
      // Re-bind a conversation the user switched to while reconnecting.
      if (pendingConversationRef.current && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "open_conversation",
            conversationId: pendingConversationRef.current,
          })
        );
        pendingConversationRef.current = null;
      }
      // Flush a message the user sent while the socket was still connecting.
      // (Previously this only happened on `session_created`, which never
      // arrives until a prompt is sent — so the first message could be lost.)
      if (pendingMessageRef.current && ws.readyState === WebSocket.OPEN) {
        const { sessionId: _, ...wsParams } = paramsRef.current || {};
        const pending = pendingMessageRef.current;
        ws.send(
          JSON.stringify({
            type: "prompt",
            message: pending.text,
            files: pending.files,
            ...wsParams,
          })
        );
        pendingMessageRef.current = null;
        setStatus("submitted");
        armWatchdog();
      }
    };

    ws.onmessage = handleWsMessage;

    ws.onclose = (e: CloseEvent) => {
      clearTimeout(connectTimer);
      logWsEvent("ws-close", `code ${e.code}${e.reason ? ` ${e.reason}` : ""}`, e.wasClean);
      // A superseded socket (the effect reconnected with a new wsUrl) shouldn't
      // touch the live connection's status or raise a false "can't connect".
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (!opened) {
        setError(
          "Could not connect to the agent server — is it running? Your message was not sent."
        );
        setStatus("ready");
        return;
      }
      if (
        statusRef.current === "submitted" ||
        statusRef.current === "streaming" ||
        pendingMessageRef.current
      ) {
        setError(
          "Connection to the agent server was lost mid-turn — send it again to reconnect."
        );
      }
      setStatus("ready");
    };

    ws.onerror = () => {
      logWsEvent("ws-error", wsUrl, false);
    };

    wsRef.current = ws;
  }, [handleWsMessage, wsUrl, armWatchdog]);

  // Connect on mount (or when wsUrl changes)
  useEffect(() => {
    connect();
    return () => {
      clearWatchdog();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, clearWatchdog]);

  const statusRef = useRef(status);
  statusRef.current = status;

  const sendMessage = useCallback(
    (text: string, files?: AttachedFile[]) => {
      const hasFiles = !!files && files.length > 0;
      if (!text.trim() && !hasFiles) return;

      // Block while the agent is still processing the previous turn.
      // Otherwise pi-coding-agent throws "Agent is already processing".
      if (statusRef.current === "submitted" || statusRef.current === "streaming") {
        return;
      }

      setError(null);
      pendingSkillRef.current = null;
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: text, files },
      ]);
      setStatus("submitted");

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        // Store the message and connect — it'll be sent after session_created
        pendingMessageRef.current = { text, files };
        connect();
        return;
      }

      const { sessionId: _, ...wsParams } = paramsRef.current || {};
      wsRef.current.send(
        JSON.stringify({ type: "prompt", message: text, files, ...wsParams })
      );
      armWatchdog();
    },
    [connect, armWatchdog]
  );

  const answerQuestion = useCallback(
    (toolCallId: string, value: string) => {
      // Optimistically mark the question answered so its pills disable and the
      // picked option highlights immediately; the server echoes the same value
      // back as the tool's output once the parked turn resumes.
      updateLastAssistant((msg) => ({
        ...msg,
        tools: msg.tools?.map((t) =>
          t.toolCallId === toolCallId
            ? { ...t, output: value, state: "output-available" }
            : t
        ),
      }));
      setAnsweredQuestions((a) => ({ ...a, [toolCallId]: value }));
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: "answer", toolCallId, value }));
      armWatchdog();
    },
    [updateLastAssistant, armWatchdog]
  );

  // Return the result of a `ui_widget` command back to the parked agent turn.
  // The agent's `ui_widget` tool blocks until this `widget_result` arrives.
  const sendWidgetResult = useCallback(
    (toolCallId: string, result: unknown) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(
        JSON.stringify({ type: "widget_result", toolCallId, result })
      );
      armWatchdog();
    },
    [armWatchdog]
  );

  const stop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "abort" }));
    }
  }, []);

  const clearSession = useCallback(() => {
    clearWatchdog();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "new_session" }));
    }
    setMessages([]);
    setModel(null);
    setCurrentConversationId(null);
    setStatus("ready");
    setError(null);
    setAnsweredQuestions({});
    contentRef.current = "";
    reasoningRef.current = "";
  }, [clearWatchdog]);

  // Switch to a past conversation: render its history and bind new prompts to
  // it over the live socket (no reconnect). The next prompt resumes the thread.
  const openConversation = useCallback(
    (conversationId: string, historyMessages: ChatMessage[]) => {
      clearWatchdog();
      setError(null);
      setAnsweredQuestions({});
      pendingSkillRef.current = null;
      pendingMessageRef.current = null;
      contentRef.current = "";
      reasoningRef.current = "";
      setMessages(historyMessages);
      setCurrentConversationId(conversationId);
      setStatus("ready");
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "open_conversation", conversationId })
        );
        return;
      }
      pendingConversationRef.current = conversationId;
      connect();
    },
    [clearWatchdog, connect]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    messages,
    status,
    model,
    cwd,
    mcpTools,
    expectedMcpServers,
    mcpLoaded,
    activeTool,
    error,
    answeredQuestions,
    currentConversationId,
    sendMessage,
    answerQuestion,
    sendWidgetResult,
    stop,
    clearSession,
    openConversation,
    clearError,
  };
}
