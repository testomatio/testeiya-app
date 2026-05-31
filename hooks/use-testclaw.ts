"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  state: "input-available" | "output-available" | "output-error";
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
}

export type ChatStatus = "ready" | "connecting" | "submitted" | "streaming";

export interface TestClawParams {
  projectIds?: string[];
  sessionId?: string;
  [key: string]: unknown;
}

/**
 * Resolve the agent WebSocket origin. In the desktop/static build the UI is
 * served by the Bun app-server, so the agent socket is same-origin — derive it
 * from `window.location`. An explicit `NEXT_PUBLIC_TESTCLAW_WS_URL` still wins
 * (e.g. dev, where the UI runs under `next dev` and the server is elsewhere).
 */
function getWsBase(): string {
  // Web dev (`next dev`): the UI is served by Next on a different origin than the
  // Bun agent server, so honor the explicit WS URL (e.g. ws://localhost:3210).
  // HTTP `/api/*` is proxied by Next rewrites, but WebSocket upgrades can't be —
  // hence connecting to the agent server directly here.
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_TESTCLAW_WS_URL
  ) {
    return process.env.NEXT_PUBLIC_TESTCLAW_WS_URL;
  }
  // Production/static build: the unified server serves the UI *and* the agent
  // WebSocket on one origin (desktop random port, embedded web), so connect
  // same-origin. This must win over any baked NEXT_PUBLIC_TESTCLAW_WS_URL — the
  // desktop server's port is dynamic, so a baked value would hit a dead port.
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return process.env.NEXT_PUBLIC_TESTCLAW_WS_URL || "ws://localhost:3210";
}

export function useTestClaw(params?: TestClawParams) {
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
  /** Name of the currently-in-flight tool, or null if none. */
  const [activeTool, setActiveTool] = useState<string | null>(null);
  /** Last error from the agent server (e.g. missing API key). Shown in the UI. */
  const [error, setError] = useState<string | null>(null);

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
  const pendingMessageRef = useRef<string | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  /** Fires if a sent prompt produces no server event at all (dropped socket,
   *  prompt never delivered) — turns the silent failure into a visible error. */
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
      setStatus((s) => (s === "submitted" || s === "streaming" ? "ready" : s));
      setError(
        "The agent stopped responding (no activity for 45s). The connection may have dropped — please try sending your message again."
      );
    }, 45000);
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

  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      // Any server event means the prompt was received and is being handled.
      // Re-arm the stall detector for in-progress events; disarm on terminal
      // ones (the turn ended, or we're idle waiting for the user).
      clearWatchdog();
      const terminal = ["finish", "done", "error", "abort", "session_cleared"];
      if (!terminal.includes(data.type as string)) armWatchdog();

      switch (data.type) {
        case "session_created":
          setModel(data.model as string);
          setCwd(typeof data.cwd === "string" ? data.cwd : null);
          setMcpTools(Array.isArray(data.mcpTools) ? (data.mcpTools as string[]) : []);
          setMcpLoaded(true);
          // If there's a pending message, send it now
          if (pendingMessageRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            const { sessionId: _, ...wsParams } = paramsRef.current || {};
            wsRef.current.send(
              JSON.stringify({
                type: "prompt",
                message: pendingMessageRef.current,
                ...wsParams,
              })
            );
            pendingMessageRef.current = null;
          }
          break;

        case "start":
          currentMsgIdRef.current = data.messageId as string;
          contentRef.current = "";
          reasoningRef.current = "";
          setMessages((prev) => [
            ...prev,
            { id: data.messageId as string, role: "assistant", content: "" },
          ]);
          setStatus("submitted");
          break;

        case "text-start":
          setStatus("streaming");
          break;

        case "text-delta":
          contentRef.current += data.delta as string;
          const text = contentRef.current;
          updateLastAssistant((msg) => ({ ...msg, content: text }));
          break;

        case "text-end":
          break;

        case "reasoning-start":
          reasoningStartRef.current = Date.now();
          updateLastAssistant((msg) => ({
            ...msg,
            reasoning: { content: "", isStreaming: true },
          }));
          break;

        case "reasoning-delta":
          reasoningRef.current += data.delta as string;
          const reasoning = reasoningRef.current;
          updateLastAssistant((msg) => ({
            ...msg,
            reasoning: { content: reasoning, isStreaming: true },
          }));
          break;

        case "reasoning-end": {
          const duration = Math.round(
            (Date.now() - reasoningStartRef.current) / 1000
          );
          updateLastAssistant((msg) => ({
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
          setActiveTool(tool.toolName);
          updateLastAssistant((msg) => ({
            ...msg,
            tools: [...(msg.tools || []), tool],
          }));
          break;
        }

        case "tool-output-available": {
          const toolCallId = data.toolCallId as string;
          const output = data.output as string;
          setActiveTool(null);
          updateLastAssistant((msg) => ({
            ...msg,
            tools: msg.tools?.map((t) =>
              t.toolCallId === toolCallId
                ? {
                    ...t,
                    output,
                    state: output.startsWith("Error:")
                      ? "output-error"
                      : "output-available",
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
          console.error("TestClaw error:", data.error);
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
          setStatus("ready");
          break;
      }
    },
    [updateLastAssistant, clearWatchdog, armWatchdog]
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

    ws.onopen = () => {
      setStatus("ready");
      // Flush a message the user sent while the socket was still connecting.
      // (Previously this only happened on `session_created`, which never
      // arrives until a prompt is sent — so the first message could be lost.)
      if (pendingMessageRef.current && ws.readyState === WebSocket.OPEN) {
        const { sessionId: _, ...wsParams } = paramsRef.current || {};
        ws.send(
          JSON.stringify({
            type: "prompt",
            message: pendingMessageRef.current,
            ...wsParams,
          })
        );
        pendingMessageRef.current = null;
        setStatus("submitted");
        armWatchdog();
      }
    };

    ws.onmessage = handleWsMessage;

    ws.onclose = () => {
      wsRef.current = null;
      setStatus("ready");
    };

    ws.onerror = () => {
      wsRef.current = null;
      setStatus("ready");
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
    (text: string) => {
      if (!text.trim()) return;

      // Block while the agent is still processing the previous turn.
      // Otherwise pi-coding-agent throws "Agent is already processing".
      if (statusRef.current === "submitted" || statusRef.current === "streaming") {
        return;
      }

      setError(null);
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: text },
      ]);
      setStatus("submitted");

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        // Store the message and connect — it'll be sent after session_created
        pendingMessageRef.current = text;
        connect();
        return;
      }

      const { sessionId: _, ...wsParams } = paramsRef.current || {};
      wsRef.current.send(
        JSON.stringify({ type: "prompt", message: text, ...wsParams })
      );
      armWatchdog();
    },
    [connect, armWatchdog]
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
    setStatus("ready");
    setError(null);
    contentRef.current = "";
    reasoningRef.current = "";
  }, [clearWatchdog]);

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
    sendMessage,
    stop,
    clearSession,
    clearError,
  };
}
