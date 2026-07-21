import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerWebSocket } from "bun";
import { createConnection, type Connection } from "./connection.js";
import { agentStart } from "./api/agent-start.js";
import { agentGet } from "./api/agent-get.js";
import { filesRead } from "./api/files-read.js";
import { filesTree } from "./api/files-tree.js";
import { filesWrite } from "./api/files-write.js";
import { filesDelete } from "./api/files-delete.js";
import { filesRename } from "./api/files-rename.js";
import { testomatioProxy } from "./api/testomatio-proxy.js";
import { testomatioAttachUpload } from "./api/testomatio-attachment.js";
import { testomatioTranscribe } from "./api/testomatio-transcription.js";
import { testomatioRunStats } from "./api/testomatio-run-stats.js";
import {
  testomatioAuthGet,
  testomatioAuthPost,
  testomatioAuthDelete,
  testomatioAuthSession,
  testomatioHostPost,
} from "./api/testomatio-auth.js";
import { settingsGet, settingsPost, settingsEnvGet, settingsEnvPost } from "./api/settings.js";
import { skillsList, skillsOpen } from "./api/skills.js";
import {
  mcpList,
  mcpToggle,
  mcpAdd,
  mcpRemove,
  mcpCatalog,
  mcpOauthStart,
  mcpOauthStatus,
} from "./api/mcp.js";
import {
  providersGet,
  providersModels,
  providersSelect,
  providersThinking,
  providersKey,
  providersLogout,
  providersLogin,
  providersLoginStatus,
  providersLoginCancel,
  providersLoginCode,
} from "./api/providers.js";
import { workspaceOpen, workspacePick, workspaceDefault, workspaceReveal } from "./api/workspace.js";
import { workspaceSync } from "./api/workspace-sync.js";
import { workspaceSearch } from "./api/workspace-search.js";
import { memoryGet, memoryPost } from "./api/memory.js";
import {
  sessionsList,
  sessionMessages,
  sessionRename,
  sessionDelete,
} from "./api/sessions.js";
import { openExternal } from "./api/open-external.js";
import { clientLog } from "./api/client-log.js";
import { debugStream } from "./api/debug-stream.js";
import { debugReport } from "./api/debug-report.js";
import { debugSnapshot } from "./api/debug-snapshot.js";
import { debugLayout } from "./api/debug-layout.js";
import { captureServerConsole } from "./debug-bus.js";
import { writeServerInfo } from "./server-info.js";
import { initFileLog, logStartupConfig, appLogPath } from "./file-log.js";
import {
  playwrightOpen,
  playwrightClose,
  playwrightFocus,
  playwrightRecord,
  playwrightStop,
  playwrightScreenshot,
  playwrightAttachScreenshot,
  playwrightStatus,
  playwrightIncognito,
  configurePlaywrightCliEnv,
} from "./api/playwright-cli.js";
import { loadEnvFiles } from "./load-env.js";
import { migrateLegacyHomeDir } from "./project-dir.js";
import { initTelemetry, flushTelemetry } from "./telemetry.js";

/**
 * Unified Testeiya desktop server. A single Bun.serve() that:
 *   - serves the statically-exported Next.js UI (the `out/` dir),
 *   - hosts the HTTP API ported from the old Next route handlers,
 *   - upgrades WebSockets for the agent stream (replacing the old :3210 server).
 *
 * Everything is same-origin so the webview's relative `fetch("/api/...")` and a
 * same-origin WebSocket both work with no CORS or port juggling.
 */

const DEFAULT_PORT = parseInt(
  process.env.PORT || process.env.TESTEIYA_PORT || "3050",
  10
);
const HOSTNAME = process.env.HOST || "127.0.0.1";

// Endpoints the UI polls on a timer, plus the debug plumbing itself — logging
// every hit floods the app log with noise. Suppress the per-request `[api]` line
// for anything under these path prefixes.
const QUIET_API_PREFIXES = ["/api/playwright/status", "/api/files/tree", "/api/debug"];

// Where the static Next export lives. Defaults to `<repo>/out`; the Electrobun
// entry passes the bundled location (or set TESTEIYA_STATIC_DIR).
const DEFAULT_STATIC_DIR =
  process.env.TESTEIYA_STATIC_DIR ||
  fileURLToPath(new URL("../../out", import.meta.url));

export interface AppServerOptions {
  /** Listen port. Use 0 to let the OS pick a free port (read it from `server.port`). */
  port?: number;
  /** Directory containing the static Next export to serve. */
  staticDir?: string;
}

interface SocketData {
  storedSessionId: string | null;
  conn: Connection | null;
}

function notFound(message = "Not found"): Response {
  return new Response(message, { status: 404 });
}

async function handleApi(req: Request, pathname: string): Promise<Response> {
  const method = req.method.toUpperCase();
  if (!QUIET_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    console.log(`[api] ${method} ${pathname}`);
  }

  if (pathname === "/api/agent/start" && method === "POST") {
    return agentStart(req);
  }
  // /api/agent/:sessionId
  const agentMatch = pathname.match(/^\/api\/agent\/([^/]+)$/);
  if (agentMatch && method === "GET") {
    return agentGet(decodeURIComponent(agentMatch[1]));
  }
  if (pathname === "/api/files/read" && method === "GET") {
    return filesRead(req);
  }
  if (pathname === "/api/files/tree" && method === "GET") {
    return filesTree(req);
  }
  if (pathname === "/api/files/write" && method === "POST") {
    return filesWrite(req);
  }
  if (pathname === "/api/files/delete" && method === "POST") {
    return filesDelete(req);
  }
  if (pathname === "/api/files/rename" && method === "POST") {
    return filesRename(req);
  }
  // Testomat.io user login (JWT) — must come before the generic
  // /api/testomatio/:resource proxy match below (different prefix, but keep the
  // auth routes grouped and unambiguous).
  if (pathname === "/api/auth/testomatio/session" && method === "POST") {
    return testomatioAuthSession(req);
  }
  if (pathname === "/api/auth/testomatio/host" && method === "POST") {
    return testomatioHostPost(req);
  }
  if (pathname === "/api/auth/testomatio") {
    if (method === "GET") return testomatioAuthGet();
    if (method === "POST") return testomatioAuthPost(req);
    if (method === "DELETE") return testomatioAuthDelete();
  }
  if (pathname === "/api/testomatio/attachment" && method === "POST") {
    return testomatioAttachUpload(req);
  }
  if (pathname === "/api/testomatio/transcription" && method === "POST") {
    return testomatioTranscribe(req);
  }
  if (pathname === "/api/testomatio/run-stats" && method === "GET") {
    return testomatioRunStats(req);
  }
  // /api/testomatio/:resource
  const tioMatch = pathname.match(/^\/api\/testomatio\/([^/]+)$/);
  if (tioMatch && (method === "GET" || method === "PUT" || method === "POST")) {
    return testomatioProxy(req, decodeURIComponent(tioMatch[1]));
  }
  if (pathname === "/api/debug/stream" && method === "GET") {
    return debugStream();
  }
  if (pathname === "/api/debug/snapshot" && method === "GET") {
    return debugSnapshot(req);
  }
  if (pathname === "/api/debug/report" && method === "POST") {
    return debugReport(req);
  }
  if (pathname === "/api/debug/layout" && method === "GET") {
    return debugLayout(req);
  }
  if (pathname === "/api/settings/env") {
    if (method === "GET") return settingsEnvGet(req);
    if (method === "POST") return settingsEnvPost(req);
  }
  if (pathname === "/api/settings") {
    if (method === "GET") return settingsGet();
    if (method === "POST") return settingsPost(req);
  }
  if (pathname === "/api/skills/open" && method === "POST") {
    return skillsOpen();
  }
  if (pathname === "/api/skills" && method === "GET") {
    return skillsList(req);
  }
  if (pathname === "/api/mcp/catalog" && method === "GET") {
    return mcpCatalog();
  }
  if (pathname === "/api/mcp/oauth/start" && method === "POST") {
    return mcpOauthStart(req);
  }
  if (pathname === "/api/mcp/oauth/status" && method === "GET") {
    return mcpOauthStatus(req);
  }
  if (pathname === "/api/mcp/add" && method === "POST") {
    return mcpAdd(req);
  }
  if (pathname === "/api/mcp/remove" && (method === "POST" || method === "DELETE")) {
    return mcpRemove(req);
  }
  if (pathname === "/api/mcp") {
    if (method === "GET") return mcpList(req);
    if (method === "POST") return mcpToggle(req);
  }
  // Providers & Models — list/select/key/logout + OAuth sign-in bridge.
  // Specific subpaths must come before the bare `/api/providers` match.
  if (pathname === "/api/providers/models" && method === "GET") {
    return providersModels(req);
  }
  if (pathname === "/api/providers/select" && method === "POST") {
    return providersSelect(req);
  }
  if (pathname === "/api/providers/thinking" && method === "POST") {
    return providersThinking(req);
  }
  if (pathname === "/api/providers/key" && method === "POST") {
    return providersKey(req);
  }
  if (pathname === "/api/providers/logout" && method === "POST") {
    return providersLogout(req);
  }
  if (pathname === "/api/providers/login" && method === "POST") {
    return providersLogin(req);
  }
  // /api/providers/login/:provider  (+ /cancel, /code)
  const loginCancelMatch = pathname.match(
    /^\/api\/providers\/login\/([^/]+)\/cancel$/,
  );
  if (loginCancelMatch && method === "POST") {
    return providersLoginCancel(decodeURIComponent(loginCancelMatch[1]));
  }
  const loginCodeMatch = pathname.match(
    /^\/api\/providers\/login\/([^/]+)\/code$/,
  );
  if (loginCodeMatch && method === "POST") {
    return providersLoginCode(decodeURIComponent(loginCodeMatch[1]), req);
  }
  const loginStatusMatch = pathname.match(/^\/api\/providers\/login\/([^/]+)$/);
  if (loginStatusMatch && method === "GET") {
    return providersLoginStatus(decodeURIComponent(loginStatusMatch[1]));
  }
  if (pathname === "/api/providers" && method === "GET") {
    return providersGet();
  }
  if (pathname === "/api/workspace" && method === "POST") {
    return workspaceOpen(req);
  }
  if (pathname === "/api/workspace/default" && method === "GET") {
    return workspaceDefault();
  }
  if (pathname === "/api/workspace/sync" && method === "POST") {
    return workspaceSync(req);
  }
  if (pathname === "/api/workspace/search" && method === "GET") {
    return workspaceSearch(req);
  }
  if (pathname === "/api/workspace/pick" && method === "POST") {
    return workspacePick();
  }
  if (pathname === "/api/workspace/reveal" && method === "POST") {
    return workspaceReveal(req);
  }
  if (pathname === "/api/sessions" && method === "GET") {
    return sessionsList(req);
  }
  const sessionMessagesMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (sessionMessagesMatch && method === "GET") {
    return sessionMessages(decodeURIComponent(sessionMessagesMatch[1]), req);
  }
  const sessionRenameMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/rename$/);
  if (sessionRenameMatch && method === "POST") {
    return sessionRename(decodeURIComponent(sessionRenameMatch[1]), req);
  }
  const sessionDeleteMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionDeleteMatch && method === "DELETE") {
    return sessionDelete(decodeURIComponent(sessionDeleteMatch[1]), req);
  }
  if (pathname === "/api/memory") {
    if (method === "GET") return memoryGet(req);
    if (method === "POST") return memoryPost(req);
  }
  if (pathname === "/api/open-external" && method === "POST") {
    return openExternal(req);
  }
  if (pathname === "/api/playwright/open" && method === "POST") {
    return playwrightOpen(req);
  }
  if (pathname === "/api/playwright/close" && method === "POST") {
    return playwrightClose(req);
  }
  if (pathname === "/api/playwright/focus" && method === "POST") {
    return playwrightFocus(req);
  }
  if (pathname === "/api/playwright/record" && method === "POST") {
    return playwrightRecord(req);
  }
  if (pathname === "/api/playwright/stop" && method === "POST") {
    return playwrightStop(req);
  }
  if (pathname === "/api/playwright/screenshot" && method === "POST") {
    return playwrightScreenshot(req);
  }
  if (pathname === "/api/playwright/attach" && method === "POST") {
    return playwrightAttachScreenshot(req);
  }
  if (pathname === "/api/playwright/status" && method === "GET") {
    return playwrightStatus(req);
  }
  if (pathname === "/api/playwright/incognito" && method === "POST") {
    return playwrightIncognito(req);
  }
  if (pathname === "/api/client-log" && method === "POST") {
    return clientLog(req);
  }

  return notFound("Unknown API route");
}

/** Resolve a request path to a file in the static export, trying the export's
 *  route conventions: exact file, `<path>.html`, then `<path>/index.html`. */
async function serveStatic(staticDir: string, pathname: string): Promise<Response> {
  const rel = pathname.replace(/^\/+/, "");
  const candidates = rel === "" ? ["index.html"] : [
    rel,
    `${rel}.html`,
    `${rel}/index.html`,
  ];
  for (const candidate of candidates) {
    const file = Bun.file(join(staticDir, candidate));
    if (await file.exists()) return new Response(file);
  }
  // SPA fallback so client-routed paths still load the app shell.
  const fallback = Bun.file(join(staticDir, "index.html"));
  if (await fallback.exists()) return new Response(fallback);
  return notFound();
}

function startServer(options: AppServerOptions = {}) {
  // Mirror the server's own stdout into the debug snapshot's `server.console`.
  captureServerConsole();

  // Carry over an existing ~/.testclaw state dir to ~/.testeiya (rename) before
  // any session/auth/config read or the migrated ~/.testeiya/.env is loaded.
  migrateLegacyHomeDir();

  // Open the persistent file log (after the home-dir migration, which bails if
  // ~/.testeiya already exists). Tees console + records crashes to disk.
  initFileLog(options.port === 0 ? "desktop" : "web");

  // Fill in env (e.g. OPENROUTER_API_KEY) from .env files the bundled app's CWD
  // wouldn't otherwise pick up. Existing/exported vars always win.
  loadEnvFiles();

  // Record the resolved config + env presence at the top of the app log (no keys).
  logStartupConfig();

  // Put the shipped `playwright-cli` on PATH and pin a shared browser session so
  // the agent's CLI calls and the record/stop/screenshot endpoints line up.
  configurePlaywrightCliEnv();

  // Start OpenTelemetry → Langfuse (no-op unless LANGFUSE_* keys are present).
  // Must run before any agent session is created so the tracer is registered.
  initTelemetry();

  // Auth gate: when bound beyond loopback, require a shared token on every
  // /api/* request and WS upgrade. Resolved after loadEnvFiles() so a token in
  // ~/.testeiya/.env is honored. Loopback (desktop/dev default) stays open.
  const authToken = process.env.TESTEIYA_AUTH_TOKEN || "";
  const requireAuth = !isLoopbackHost(HOSTNAME);
  if (requireAuth && !authToken) {
    throw new Error(
      "Refusing to start: HOST is non-loopback but TESTEIYA_AUTH_TOKEN is not set. " +
        "Set a token, bind to 127.0.0.1, or place the server behind an authenticating proxy."
    );
  }

  const port = options.port ?? DEFAULT_PORT;
  const staticDir = options.staticDir ?? DEFAULT_STATIC_DIR;

  const server = Bun.serve<SocketData>({
    port,
    hostname: HOSTNAME,
    // Default is 10s, which is shorter than our upstream Testomat.io calls —
    // large accounts (hundreds of projects) can take 10s+ to fetch, and a slow
    // backend would otherwise reset the client socket before our handler can
    // return a clean JSON error. Keep this above FETCH_TIMEOUT_MS in
    // testomatio-auth.ts. (255 is Bun's max.)
    idleTimeout: 60,
    async fetch(req, server) {
      const url = new URL(req.url);
      const wantsWs = req.headers.get("upgrade")?.toLowerCase() === "websocket";

      // Gate /api/* and WS behind the shared token when bound beyond loopback.
      // Static assets stay open so the UI shell can load and prompt for auth.
      if (requireAuth && (wantsWs || url.pathname.startsWith("/api/"))) {
        const bearer = req.headers.get("authorization");
        const tokenOk =
          bearer === `Bearer ${authToken}` ||
          url.searchParams.get("token") === authToken;
        if (!tokenOk) return new Response("Unauthorized", { status: 401 });
      }

      // WebSocket upgrade for the agent stream.
      if (wantsWs) {
        const ok = server.upgrade(req, {
          data: {
            storedSessionId: url.searchParams.get("session"),
            conn: null,
          },
        });
        if (ok) return undefined as unknown as Response;
        console.warn("[ws] upgrade failed");
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      if (url.pathname.startsWith("/api/")) {
        try {
          return await handleApi(req, url.pathname);
        } catch (err: any) {
          console.error("[api] error:", err?.message || err);
          return Response.json(
            { error: err?.message || "Internal error" },
            { status: 500 }
          );
        }
      }

      return serveStatic(staticDir, url.pathname);
    },
    websocket: {
      // Prompts can carry base64 file attachments (images + uploads), which
      // dwarf Bun's 16MB default. Allow comfortably large payloads.
      maxPayloadLength: 64 * 1024 * 1024,
      open(ws: ServerWebSocket<SocketData>) {
        const { storedSessionId } = ws.data;
        console.log(
          "Client connected",
          storedSessionId ? `(session: ${storedSessionId})` : ""
        );
        ws.data.conn = createConnection(storedSessionId, (data) => {
          ws.send(JSON.stringify(data));
        });
      },
      message(ws: ServerWebSocket<SocketData>, message) {
        void ws.data.conn?.handleRaw(String(message));
      },
      close(ws: ServerWebSocket<SocketData>) {
        console.log("Client disconnected");
        ws.data.conn?.close();
        void flushTelemetry();
      },
    },
  });

  const boundPort = server.port ?? port;
  writeServerInfo({
    port: boundPort,
    pid: process.pid,
    url: `http://${HOSTNAME}:${boundPort}`,
    mode: options.port === 0 ? "desktop" : "web",
    startedAt: new Date().toISOString(),
    logFile: appLogPath(),
  });

  console.log(`Testeiya app server listening on http://${HOSTNAME}:${server.port}`);
  console.log(`Serving static UI from ${staticDir}`);
  console.log(`Debug log → ${appLogPath()}`);
  return server;
}

// Run directly (bun src/app-server.ts). When imported by the Electrobun entry,
// the caller invokes startAppServer() instead.
if (import.meta.main) {
  startServer();
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export { startServer as startAppServer, DEFAULT_PORT, HOSTNAME };
