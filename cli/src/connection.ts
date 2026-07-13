import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_DIR } from "./project-dir.js";
import { createTesteiyaSession } from "./session-factory.js";
import { transformEvent } from "./bridge.js";
import { attachAiDebug } from "./ai-debug.js";
import { getSession } from "./session-store.js";
import { resolveSessionShellEnv } from "./api/testomatio-target.js";
import { loadBundledSkills } from "./skills.js";
import { browserStateNotice } from "./api/playwright-cli.js";

// Skills are static for the process; load once. Each entry has name +
// description + filePath (see skills.ts).
let skillsCache: ReturnType<typeof loadBundledSkills> | null = null;
function getSkills() {
  if (!skillsCache) skillsCache = loadBundledSkills();
  return skillsCache;
}

/** While a prompt is being processed the server emits a lightweight `ping`
 *  every HEARTBEAT_MS. It lets the client's stall watchdog tell "still working"
 *  (long tool calls, deep thinking) apart from a genuinely dropped socket, so a
 *  slow turn never surfaces a false "connection lost" error. */
const HEARTBEAT_MS = 15000;

/** Transport-agnostic sender — `ws.send(JSON.stringify(...))` for either the
 *  `ws` library or Bun's native ServerWebSocket. */
export type Send = (data: Record<string, any>) => void;

export interface Connection {
  /** Feed one raw text frame from the socket. */
  handleRaw(raw: string): Promise<void>;
  /** Tear down the agent subscription when the socket closes. */
  close(): void;
}

/**
 * Per-connection agent driver. Holds the session/subscription state in a
 * closure so it can back any WebSocket transport — used by the unified Bun
 * app-server's WS upgrade.
 */
export function createConnection(
  storedSessionId: string | null,
  send: Send
): Connection {
  let session: any = null;
  let askChannel: any = null;
  let widgetChannel: any = null;
  let unsubscribe: (() => void) | null = null;
  let aiDebugUnsub: (() => void) | null = null;
  let messageId = "";
  let sessionCwd = process.cwd();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let resumeConversationId: string | null = null;

  async function handleMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case "prompt": {
        // Keep the client's stall watchdog fed for the whole turn — session
        // creation and long tool calls can both outlast it otherwise.
        stopHeartbeat();
        heartbeat = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);
        try {
          // Create session on first prompt
          if (!session) {
            const { type: _, message: __, ...sessionParams } = msg;

            // Merge stored session config if a session ID was provided
            if (storedSessionId) {
              const stored = getSession(storedSessionId);
              if (stored) {
                sessionParams.cwd = stored.cwd;
                sessionParams.promptContext = stored.promptContext;
                sessionParams.backendUrl = stored.backendUrl;
                sessionParams.tokens = stored.tokens;
                sessionParams.projects = stored.projects;
                sessionParams.trusted = stored.trusted;
              }
            }

            sessionCwd = sessionParams.cwd || process.cwd();
            if (sessionParams.backendUrl) {
              process.env.TESTOMATIO_URL = sessionParams.backendUrl;
            }
            const tokenEntries = sessionParams.tokens
              ? Object.entries(sessionParams.tokens)
              : [];
            // NOTE: process.env is process-GLOBAL and the unified server is one
            // process serving many WS connections, so concurrent sessions share
            // the last-set token (accepted: desktop and single-user web are the
            // real deployments; per-session isolation needs an SDK env hook).
            // The shell-env.ts patch overlays these live values onto the SDK's
            // otherwise frozen-after-first-use shell env, so whatever is set
            // here is what every agent bash command actually sees.
            let tokenSource = "none";
            if (tokenEntries.length === 1) {
              process.env.TESTOMATIO = tokenEntries[0][1] as string;
              tokenSource = "managed";
            } else if (tokenEntries.length > 1) {
              // A single global TESTOMATIO would be wrong for all but one
              // project — unset it; the agent uses per-project MCP / app Sync.
              delete process.env.TESTOMATIO;
              tokenSource = "managed-multi";
            } else {
              const resolved = await resolveSessionShellEnv(
                {
                  tokens: sessionParams.tokens,
                  backendUrl: sessionParams.backendUrl,
                  projects: sessionParams.projects ?? [],
                },
                sessionCwd
              );
              if (resolved) {
                Object.assign(process.env, resolved.env);
                tokenSource = resolved.source;
                sessionParams.connection = {
                  tokenAvailable: true,
                  projectId: resolved.projectId,
                  title: resolved.title,
                };
              } else {
                delete process.env.TESTOMATIO;
                delete process.env.TESTOMATIO_PROJECT_ID;
                sessionParams.connection = { tokenAvailable: false };
              }
            }

            console.log(
              "[session] cwd:", sessionParams.cwd || `default (${process.cwd()})`,
              "| promptContext:", sessionParams.promptContext ? "yes" : "no",
              "| TESTOMATIO:", process.env.TESTOMATIO ? "set" : "unset",
              `(${tokenSource})`,
              "| TESTOMATIO_URL:", process.env.TESTOMATIO_URL || "default"
            );
            const result = await createTesteiyaSession({
              ...sessionParams,
              mode: "web",
              resumeConversationId: resumeConversationId ?? undefined,
            });
            session = result.session;
            aiDebugUnsub = attachAiDebug(session, (result as any).conversationId ?? null);
            askChannel = (result as any).askChannel ?? null;
            widgetChannel = (result as any).widgetChannel ?? null;

            const mcpManager = (result as any).mcpManager;
            let mcpTools: string[] = [];
            const mcpServerStatus: Record<string, string> = {};
            try {
              if (mcpManager) {
                const tools = mcpManager.getTools?.() ?? [];
                mcpTools = tools.map((t: any) => t.name ?? String(t));
                const connections = mcpManager.getConnections?.() ?? [];
                for (const name of Object.keys(connections)) {
                  mcpServerStatus[name] = mcpManager.getConnectionStatus?.(name) ?? "unknown";
                }
              }
            } catch (e) {
              console.warn("[session] failed to enumerate MCP tools:", e);
            }

            // Enumerate ALL tools available to the agent (including custom tools like render_list).
            try {
              const sessionTools = (session as any)?.tools;
              if (sessionTools instanceof Map) {
                const allNames = Array.from(sessionTools.keys() as Iterable<string>);
                console.log(`[session] all tools (${allNames.length}):`, allNames.filter((n) => !n.startsWith("mcp_")).join(", "));
              } else if (sessionTools && typeof sessionTools === "object") {
                console.log(`[session] tools keys:`, Object.keys(sessionTools).slice(0, 30).join(", "));
              }
            } catch (e) {
              console.warn("[session] tool enumeration error:", e);
            }

            console.log(
              `[session] created | mcp servers: ${Object.keys(mcpServerStatus).length} | mcp tools: ${mcpTools.length}`
            );
            if (Object.keys(mcpServerStatus).length > 0) {
              console.log("  mcp server status:", mcpServerStatus);
            }
            if (mcpTools.length) {
              console.log("  mcp tools:", mcpTools.join(", "));
            } else if (mcpManager) {
              console.log("  (mcpManager present but no tools returned — server may have failed to start; check stderr)");
            } else {
              console.log("  (mcpManager is undefined — enableMCP may be false or discovery found no configs)");
            }

            send({
              type: "session_created",
              model: `${result.model.provider}/${result.model.id}`,
              cwd: sessionParams.cwd || process.cwd(),
              conversationId: (result as any).conversationId,
              mcpTools,
              mcpServers: mcpServerStatus,
            });
          }

          // Clean up previous subscription
          unsubscribe?.();

          // New message ID per prompt
          messageId = `msg_${randomUUID().slice(0, 12)}`;

          // Subscribe to agent events and bridge them
          unsubscribe = session.subscribe((event: any) => {
            // The agent can re-enter its loop within one prompt (auto-retry on
            // overload, TTSR/todo continuations) — each re-entry emits a fresh
            // `agent_start`. Give every run its own id so the UI renders a
            // distinct message instead of two with the same React key.
            if (event.type === "agent_start") {
              messageId = `msg_${randomUUID().slice(0, 12)}`;
            }
            const transformed = transformEvent(event, messageId);
            if (transformed) {
              send(transformed);
            }
            if (event.type === "agent_end") {
              send({ type: "done" });
            }
          });

          // Append a live browser-state notice (if a browser is open) so the
          // agent knows a session is running and what it shows. Best-effort.
          const browserNotice = await browserStateNotice(sessionCwd);

          // The client serializes the widget the user is currently viewing (id +
          // its declared actions) into `<active_widget>`; append it per-message
          // so the agent can drive it via the `ui_widget` tool.
          const widgetNotice =
            typeof msg.activeWidget === "string" && msg.activeWidget.trim()
              ? msg.activeWidget
              : null;

          // A leading `/<skill-name>` expands the skill's content into the
          // prompt (the model receives the workflow, the UI keeps showing the
          // short command). Announce it so the UI can render a "using skill"
          // banner on the agent's reply.
          const skill = matchSkillCommand(msg.message);
          if (skill) {
            send({
              type: "skill",
              name: skill.entry.name,
              description: skill.entry.description ?? "",
            });
            await session.prompt(
              withActiveWidget(
                widgetNotice,
                withBrowserState(browserNotice, buildSkillPrompt(skill.entry, skill.args))
              )
            );
            break;
          }

          // Images go to the model natively; other files are written into the
          // workspace so the agent can read them with its file tools.
          const { text, images } = prepareAttachments(
            msg.message,
            msg.files,
            sessionCwd,
            messageId
          );
          await session.prompt(
            withActiveWidget(widgetNotice, withBrowserState(browserNotice, text)),
            images.length > 0 ? { images } : undefined
          );
        } catch (err: any) {
          console.error("[session] prompt error:", err?.message || err);
          send({ type: "error", error: err.message || String(err) });
        } finally {
          stopHeartbeat();
        }
        break;
      }

      case "answer": {
        if (askChannel && typeof msg.toolCallId === "string") {
          askChannel.answer(msg.toolCallId, String(msg.value ?? ""));
        }
        break;
      }

      case "widget_result": {
        if (widgetChannel && typeof msg.toolCallId === "string") {
          const value =
            typeof msg.result === "string" ? msg.result : JSON.stringify(msg.result ?? "");
          widgetChannel.respond(msg.toolCallId, value);
        }
        break;
      }

      case "abort": {
        if (session) {
          try {
            askChannel?.cancelAll();
            widgetChannel?.cancelAll();
            await session.abort();
            send({ type: "abort" });
          } catch (err: any) {
            send({ type: "error", error: err.message || String(err) });
          }
        }
        break;
      }

      case "new_session": {
        unsubscribe?.();
        aiDebugUnsub?.();
        aiDebugUnsub = null;
        askChannel?.cancelAll();
        widgetChannel?.cancelAll();
        session = null;
        askChannel = null;
        widgetChannel = null;
        resumeConversationId = null;
        send({ type: "session_cleared" });
        break;
      }

      case "open_conversation": {
        unsubscribe?.();
        aiDebugUnsub?.();
        aiDebugUnsub = null;
        askChannel?.cancelAll();
        widgetChannel?.cancelAll();
        session = null;
        askChannel = null;
        widgetChannel = null;
        resumeConversationId =
          typeof msg.conversationId === "string" ? msg.conversationId : null;
        send({ type: "conversation_opened", conversationId: resumeConversationId });
        break;
      }

      default:
        send({ type: "error", error: `Unknown message type: ${msg.type}` });
    }
  }

  function stopHeartbeat(): void {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  return {
    async handleRaw(raw: string): Promise<void> {
      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        send({ type: "error", error: "Invalid JSON" });
        return;
      }
      await handleMessage(msg);
    },
    close(): void {
      stopHeartbeat();
      askChannel?.cancelAll();
      widgetChannel?.cancelAll();
      unsubscribe?.();
      aiDebugUnsub?.();
    },
  };
}

/**
 * Split prompt attachments into model-native images and written-to-disk files.
 * Each attachment is a base64 data URL. Images become `ImageContent` passed to
 * the model directly; everything else is written under `<cwd>/.testeiya/uploads/
 * <messageId>/` and referenced by relative path so the agent can `read` it.
 */
function prepareAttachments(
  message: string,
  files: PromptFile[] | undefined,
  cwd: string,
  messageId: string
): { text: string; images: ImageContent[] } {
  const images: ImageContent[] = [];
  if (!files || files.length === 0) return { text: message, images };

  const savedPaths: string[] = [];
  let uploadDir = "";
  for (const file of files) {
    const match = /^data:([^;]+);base64,(.*)$/s.exec(file.dataUrl);
    if (!match) continue;
    const mimeType = file.mediaType || match[1];
    const base64 = match[2];
    if (mimeType.startsWith("image/")) {
      images.push({ type: "image", data: base64, mimeType });
      continue;
    }
    if (!uploadDir) {
      uploadDir = join(cwd, PROJECT_DIR, "uploads", messageId);
      mkdirSync(uploadDir, { recursive: true });
    }
    const safeName = file.filename.replace(/[/\\]/g, "_");
    writeFileSync(join(uploadDir, safeName), Buffer.from(base64, "base64"));
    savedPaths.push(join(PROJECT_DIR, "uploads", messageId, safeName));
  }

  if (savedPaths.length === 0) {
    // A bare image with no text leaves an empty text block, which some
    // providers reject — give it a minimal caption.
    if (images.length > 0 && !message.trim()) {
      return { text: "(see attached image)", images };
    }
    return { text: message, images };
  }

  const note = savedPaths.map((p) => `- ${p}`).join("\n");
  const base = message.trim() ? message : "(see attached files)";
  const text = `${base}\n\nAttached files saved into the workspace (read them as needed):\n${note}`;
  return { text, images };
}

type SkillEntry = ReturnType<typeof loadBundledSkills>[number];

/** Match a leading `/<skill-name>` against the loaded skills; null if none. */
function matchSkillCommand(
  message: string
): { entry: SkillEntry; args: string } | null {
  const text = (message ?? "").trimStart();
  if (!text.startsWith("/")) return null;
  const match = /^\/([^\s]+)\s*([\s\S]*)$/.exec(text);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const entry = getSkills().find((s) => s.name.toLowerCase() === name);
  if (!entry) return null;
  return { entry, args: match[2].trim() };
}

/** Append the `<browser_state>` notice (when present) to a prompt. */
function withBrowserState(notice: string | null, text: string): string {
  if (!notice) return text;
  return `${text}\n\n${notice}`;
}

/** Append the `<active_widget>` notice (when present) to a prompt. */
function withActiveWidget(notice: string | null, text: string): string {
  if (!notice) return text;
  return `${text}\n\n${notice}`;
}

/** Expand a skill into a prompt: its workflow content plus any user args. */
function buildSkillPrompt(entry: SkillEntry, args: string): string {
  let content = "";
  try {
    content = readFileSync(entry.filePath, "utf8");
  } catch {
    content = "";
  }
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  const parts = [body || `Apply the "${entry.name}" skill.`];
  if (args) parts.push(`---\n\nUser request: ${args}`);
  return parts.join("\n\n");
}

interface PromptFile {
  filename: string;
  mediaType: string;
  dataUrl: string;
}

interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}
