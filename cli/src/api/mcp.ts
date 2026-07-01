import path from "node:path";
import { readJson, writeJson } from "../json-store.js";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent";
import { connectToServer } from "@oh-my-pi/pi-coding-agent/mcp/client";
import {
  analyzeAuthError,
  discoverOAuthEndpoints,
} from "@oh-my-pi/pi-coding-agent/mcp/oauth-discovery";
import { MCPOAuthFlow } from "@oh-my-pi/pi-coding-agent/mcp/oauth-flow";
import { getSession } from "../session-store.js";
import { PROJECT_DIR, LEGACY_PROJECT_DIR, HOME_DIR } from "../project-dir.js";
import {
  getCatalogService,
  catalogDescriptors,
  type McpTransport,
} from "../mcp-catalog.js";

/**
 * MCP server settings for a session.
 *
 * The agent's MCP discovery reads `<cwd>/.testeiya/mcp.json` (the *enabled*
 * set). We keep the full catalog in `<cwd>/.testeiya/mcp.all.json` and the
 * disabled names in `<cwd>/.testeiya/mcp.disabled.json`, then derive
 * `mcp.json = all − disabled`.
 *
 * MCP servers connect when the agent session is created (on first prompt), so
 * changes (toggle/add/remove) take effect on the next session start (reconnect
 * / new prompt).
 *
 * On-disk schema mirrors the SDK's `MCPServer`. The transport field on disk is
 * `type` (the SDK reads `serverConfig.type`), NOT `transport`.
 */

interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  /** "stdio" | "sse" | "http" — the SDK's transport selector. */
  type?: McpTransport;
  auth?: {
    type?: "oauth" | "apikey";
    token?: string;
    /** Set once the OAuth flow stores a token; the SDK reads it from AuthStorage. */
    credentialId?: string;
    tokenUrl?: string;
    clientId?: string;
  };
}

interface McpFile {
  mcpServers?: Record<string, McpServerConfig>;
}

function projectDir(cwd: string): string {
  return path.join(cwd, PROJECT_DIR);
}

/** Read the full catalog, preferring `.testeiya/` and falling back to legacy `.omp/`. */
function readCatalog(cwd: string): Record<string, McpServerConfig> {
  for (const dir of [projectDir(cwd), path.join(cwd, LEGACY_PROJECT_DIR)]) {
    const all = readJson<McpFile>(path.join(dir, "mcp.all.json"), {});
    if (all.mcpServers && Object.keys(all.mcpServers).length) return all.mcpServers;
    const live = readJson<McpFile>(path.join(dir, "mcp.json"), {});
    if (live.mcpServers && Object.keys(live.mcpServers).length) return live.mcpServers;
  }
  return {};
}

function readDisabled(cwd: string): Set<string> {
  for (const dir of [projectDir(cwd), path.join(cwd, LEGACY_PROJECT_DIR)]) {
    const arr = readJson<string[] | null>(path.join(dir, "mcp.disabled.json"), null);
    if (Array.isArray(arr)) return new Set(arr);
  }
  return new Set();
}

function writeDisabled(cwd: string, disabled: Set<string>): void {
  writeJson(path.join(projectDir(cwd), "mcp.disabled.json"), [...disabled]);
}

/** Persist the full catalog (`mcp.all.json`) and recompute the enabled `mcp.json`. */
function writeCatalog(cwd: string, catalog: Record<string, McpServerConfig>): void {
  writeJson(path.join(projectDir(cwd), "mcp.all.json"), { mcpServers: catalog });
  applyEnabledSet(cwd);
}

/** Rewrite `mcp.json` (what the SDK reads) to the enabled subset of the catalog. */
function applyEnabledSet(cwd: string): void {
  const catalog = readCatalog(cwd);
  const disabled = readDisabled(cwd);
  const enabled: Record<string, McpServerConfig> = {};
  for (const [name, cfg] of Object.entries(catalog)) {
    if (!disabled.has(name)) enabled[name] = cfg;
  }
  writeJson(path.join(projectDir(cwd), "mcp.json"), { mcpServers: enabled });
}

/** Project (testomatio-pulled) servers are managed by the session and can't be removed. */
function isProjectServer(name: string): boolean {
  return name.startsWith("testomatio-");
}

/** Effective transport: explicit `type`, else inferred from command vs url. */
function transportOf(cfg: McpServerConfig): McpTransport {
  if (cfg.type) return cfg.type;
  return cfg.url ? "http" : "stdio";
}

/**
 * Build a UI-safe view of a server. Never leak secret *values*: env/header
 * values and auth tokens are dropped (only key names survive), and inline
 * `--token` / `--api-key` / `Bearer` secrets in the command string are masked.
 */
function maskServer(name: string, cfg: McpServerConfig) {
  const command = [cfg.command, ...(cfg.args ?? [])]
    .filter(Boolean)
    .join(" ")
    .replace(/(--token[=\s]+)\S+/g, "$1***")
    .replace(/(--api-?key[=\s]+)\S+/gi, "$1***")
    .replace(/(Bearer\s+)\S+/g, "$1***");
  return {
    name,
    type: transportOf(cfg),
    enabled: true, // overwritten by listFor
    command: cfg.command ? command : undefined,
    url: cfg.url,
    // Expose only the KEYS of secret-bearing fields, never the values.
    envKeys: cfg.env ? Object.keys(cfg.env) : undefined,
    headerKeys: cfg.headers ? Object.keys(cfg.headers) : undefined,
    auth: cfg.auth?.type,
    // True once an OAuth token is stored (credentialId present) — never the token.
    authenticated: Boolean(cfg.auth?.credentialId),
    source: isProjectServer(name) ? ("project" as const) : ("user" as const),
    removable: !isProjectServer(name),
  };
}

function listFor(cwd: string) {
  const catalog = readCatalog(cwd);
  const disabled = readDisabled(cwd);
  return Object.entries(catalog).map(([name, cfg]) => ({
    ...maskServer(name, cfg),
    enabled: !disabled.has(name),
  }));
}

export async function mcpList(req: Request): Promise<Response> {
  const sessionId = new URL(req.url).searchParams.get("session");
  if (!sessionId) {
    return Response.json({ error: "session required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  return Response.json({ servers: listFor(session.cwd) });
}

export async function mcpToggle(req: Request): Promise<Response> {
  let body: { session?: string; server?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { session: sessionId, server, enabled } = body;
  if (!sessionId || !server || typeof enabled !== "boolean") {
    return Response.json(
      { error: "session, server and enabled (boolean) are required" },
      { status: 400 }
    );
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const catalog = readCatalog(session.cwd);
  if (!(server in catalog)) {
    return Response.json({ error: `Unknown MCP server: ${server}` }, { status: 404 });
  }

  const disabled = readDisabled(session.cwd);
  if (enabled) disabled.delete(server);
  else disabled.add(server);
  writeDisabled(session.cwd, disabled);
  applyEnabledSet(session.cwd);

  return Response.json({ servers: listFor(session.cwd), appliesOnRestart: true });
}

/** Validate a (raw) server config the way the SDK does: command OR url, matched to type. */
function validateServer(cfg: McpServerConfig): string | null {
  const type = transportOf(cfg);
  if (!cfg.command && !cfg.url) return "Must have command or url";
  if (type === "stdio" && !cfg.command) return "stdio transport requires a command";
  if ((type === "http" || type === "sse") && !cfg.url) {
    return `${type} transport requires a url`;
  }
  return null;
}

/** Drop undefined/empty fields so we don't persist noise. */
function cleanConfig(cfg: McpServerConfig): McpServerConfig {
  const out: McpServerConfig = {};
  if (cfg.command) out.command = cfg.command;
  if (cfg.args?.length) out.args = cfg.args;
  if (cfg.env && Object.keys(cfg.env).length) out.env = cfg.env;
  if (cfg.cwd) out.cwd = cfg.cwd;
  if (cfg.url) out.url = cfg.url;
  if (cfg.headers && Object.keys(cfg.headers).length) out.headers = cfg.headers;
  if (cfg.type) out.type = cfg.type;
  if (cfg.auth) out.auth = cfg.auth;
  return out;
}

interface AddBody {
  session?: string;
  /** Install a predefined catalog service by id. */
  fromCatalog?: string;
  /** Secret values keyed by env var name (collected for services with `secrets`). */
  secrets?: Record<string, string>;
  /** A custom server definition. */
  server?: {
    name?: string;
    type?: McpTransport;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  };
}

export async function mcpAdd(req: Request): Promise<Response> {
  let body: AddBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { session: sessionId, fromCatalog, secrets } = body;
  if (!sessionId) return Response.json({ error: "session required" }, { status: 400 });
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  let name: string;
  let config: McpServerConfig;

  if (fromCatalog) {
    const svc = getCatalogService(fromCatalog);
    if (!svc) {
      return Response.json({ error: `Unknown service: ${fromCatalog}` }, { status: 404 });
    }
    name = svc.id;
    config = cleanConfig({
      command: svc.command,
      args: svc.args,
      env: svc.env ? { ...svc.env } : undefined,
      url: svc.url,
      headers: svc.headers ? { ...svc.headers } : undefined,
      type: svc.transport,
      auth: svc.auth === "oauth" ? { type: "oauth" } : undefined,
    });
    // Merge collected secret values into env (default) so `${VAR}` references
    // resolve. Servers that need secrets in headers declare them pre-templated.
    if (svc.secrets?.length) {
      for (const s of svc.secrets) {
        const value = secrets?.[s.env];
        if (!value) {
          return Response.json(
            { error: `Missing required value: ${s.label}` },
            { status: 400 }
          );
        }
        config.env = { ...(config.env ?? {}), [s.env]: value };
      }
    }
  } else if (body.server) {
    const s = body.server;
    name = (s.name ?? "").trim();
    if (!name) return Response.json({ error: "server name required" }, { status: 400 });
    if (!/^[\w.-]+$/.test(name)) {
      return Response.json(
        { error: "name may contain only letters, numbers, '.', '_' and '-'" },
        { status: 400 }
      );
    }
    // A custom stdio command is arbitrary local exec the agent spawns on the next
    // session start — bypassing the read-only tool gating. Refuse it unless the
    // operator explicitly opts in. The trusted catalog path is unaffected.
    if (s.command && process.env.TESTEIYA_ALLOW_CUSTOM_MCP !== "1") {
      return Response.json(
        {
          error:
            "custom MCP commands are disabled; add this server from the catalog, or set TESTEIYA_ALLOW_CUSTOM_MCP=1 to enable local custom commands",
        },
        { status: 403 }
      );
    }
    config = cleanConfig({
      command: s.command?.trim(),
      args: s.args,
      env: s.env,
      url: s.url?.trim(),
      headers: s.headers,
      type: s.type,
    });
  } else {
    return Response.json({ error: "fromCatalog or server is required" }, { status: 400 });
  }

  const invalid = validateServer(config);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const catalog = readCatalog(session.cwd);
  if (name in catalog) {
    return Response.json(
      { error: `An MCP server named "${name}" already exists` },
      { status: 409 }
    );
  }
  catalog[name] = config;

  // A freshly added server defaults to enabled.
  const disabled = readDisabled(session.cwd);
  if (disabled.delete(name)) writeDisabled(session.cwd, disabled);

  writeCatalog(session.cwd, catalog);

  return Response.json({ servers: listFor(session.cwd), appliesOnRestart: true });
}

export async function mcpRemove(req: Request): Promise<Response> {
  let body: { session?: string; server?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { session: sessionId, server } = body;
  if (!sessionId || !server) {
    return Response.json({ error: "session and server are required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  if (isProjectServer(server)) {
    return Response.json(
      { error: "Project MCP servers can't be removed (disable it instead)" },
      { status: 403 }
    );
  }

  const catalog = readCatalog(session.cwd);
  if (!(server in catalog)) {
    return Response.json({ error: `Unknown MCP server: ${server}` }, { status: 404 });
  }
  delete catalog[server];

  // Drop from the disabled set too, so a later re-add isn't silently disabled.
  const disabled = readDisabled(session.cwd);
  if (disabled.delete(server)) writeDisabled(session.cwd, disabled);

  writeCatalog(session.cwd, catalog);

  return Response.json({ servers: listFor(session.cwd), appliesOnRestart: true });
}

/** Predefined services available to install (no secret values exposed). */
export async function mcpCatalog(): Promise<Response> {
  return Response.json({ services: catalogDescriptors() });
}

// ---------------------------------------------------------------------------
// OAuth bridge for remote (http/sse) MCP servers.
//
// The SDK injects a Bearer token only when a server config carries
// `auth: { type:"oauth", credentialId }` AND that credential is in AuthStorage
// (`#resolveAuthConfig`). It never *initiates* the interactive login — that
// lives only in the TUI's `/mcp` controller. So OAuth services (Figma, Linear,
// Jira, Miro) added from the catalog can never connect on their own.
//
// We port the TUI's flow to the web: discover the server's OAuth endpoints
// (provoke a 401, then `analyzeAuthError` / `discoverOAuthEndpoints`), run the
// SDK's `MCPOAuthFlow` (opens the browser + a localhost callback server), store
// the token in `~/.testeiya/auth.json`, and stamp the server config with the
// resulting `credentialId`. The agent picks it up on the next session start.
//
// Mirrors the provider sign-in bridge in `api/providers.ts`: kick the flow off,
// return the auth URL via `onAuth`, finish in the background, client polls.
// ---------------------------------------------------------------------------
type OauthStatus = "pending" | "done" | "error";
interface OauthSession {
  status: OauthStatus;
  authUrl?: string;
  instructions?: string;
  progress?: string;
  error?: string;
  abort: AbortController;
}

const oauthSessions = new Map<string, OauthSession>();

export async function mcpOauthStart(req: Request): Promise<Response> {
  let body: { session?: string; server?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { session: sessionId, server } = body;
  if (!sessionId || !server) {
    return Response.json({ error: "session and server are required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const cfg = readCatalog(session.cwd)[server];
  if (!cfg) {
    return Response.json({ error: `Unknown MCP server: ${server}` }, { status: 404 });
  }
  if (!cfg.url || transportOf(cfg) === "stdio") {
    return Response.json(
      { error: "OAuth applies to remote (http/sse) servers only" },
      { status: 400 }
    );
  }

  const key = oauthKey(sessionId, server);
  const existing = oauthSessions.get(key);
  if (existing?.status === "pending") {
    return Response.json({
      server,
      status: existing.status,
      authUrl: existing.authUrl ?? null,
      instructions: existing.instructions ?? null,
      error: null,
    });
  }

  const oauth: OauthSession = { status: "pending", abort: new AbortController() };
  oauthSessions.set(key, oauth);

  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  void runOauthFlow(session.cwd, server, cfg, oauth, resolveReady).catch((err: unknown) => {
    oauth.status = "error";
    oauth.error = err instanceof Error ? err.message : String(err);
    resolveReady();
  });

  // Respond once the auth URL is ready (or the flow failed early), but don't
  // hold the request open for the full interactive flow.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 15000));
  await Promise.race([ready, timeout]);

  return Response.json({
    server,
    status: oauth.status,
    authUrl: oauth.authUrl ?? null,
    instructions: oauth.instructions ?? null,
    error: oauth.error ?? null,
  });
}

export function mcpOauthStatus(req: Request): Response {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  const server = url.searchParams.get("server");
  if (!sessionId || !server) {
    return Response.json({ error: "session and server are required" }, { status: 400 });
  }
  const oauth = oauthSessions.get(oauthKey(sessionId, server));
  if (!oauth) return Response.json({ server, status: "idle" });
  return Response.json({
    server,
    status: oauth.status,
    authUrl: oauth.authUrl ?? null,
    instructions: oauth.instructions ?? null,
    progress: oauth.progress ?? null,
    error: oauth.error ?? null,
  });
}

function oauthKey(sessionId: string, server: string): string {
  return `${sessionId}:${server}`;
}

async function runOauthFlow(
  cwd: string,
  server: string,
  cfg: McpServerConfig,
  oauth: OauthSession,
  resolveReady: () => void
): Promise<void> {
  const endpoints = await resolveOauthEndpoints(server, cfg);

  const flow = new MCPOAuthFlow(
    {
      authorizationUrl: endpoints.authorizationUrl,
      tokenUrl: endpoints.tokenUrl,
      clientId: endpoints.clientId,
      scopes: endpoints.scopes,
    },
    {
      onAuth: (info: { url: string; instructions?: string }) => {
        oauth.authUrl = info.url;
        oauth.instructions = info.instructions;
        resolveReady();
        void openInBrowser(info.url);
      },
      onProgress: (message: string) => {
        oauth.progress = message;
      },
    }
  );

  const creds = await withTimeout(
    flow.login(),
    5 * 60 * 1000,
    "OAuth flow timed out after 5 minutes"
  );

  const credentialId = `mcp_oauth_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const authStorage = await AuthStorage.create(path.join(HOME_DIR, "auth.json"));
  await authStorage.reload();
  await authStorage.set(credentialId, { type: "oauth", ...creds });

  const catalog = readCatalog(cwd);
  const current = catalog[server];
  if (current) {
    catalog[server] = {
      ...current,
      auth: {
        type: "oauth",
        credentialId,
        tokenUrl: endpoints.tokenUrl,
        clientId: endpoints.clientId,
      },
    };
    writeCatalog(cwd, catalog);
  }

  oauth.status = "done";
  resolveReady();
}

/** Connect once without auth to provoke the 401, then extract OAuth endpoints. */
async function resolveOauthEndpoints(server: string, cfg: McpServerConfig) {
  const error = await captureConnectError(server, {
    type: transportOf(cfg),
    url: cfg.url,
    headers: cfg.headers,
  } as Parameters<typeof connectToServer>[1]);
  if (!error) {
    throw new Error("Server connected without authentication; OAuth is not required.");
  }
  const detected = analyzeAuthError(error);
  if (detected.authType === "oauth" && detected.oauth) return detected.oauth;
  const discovered = await discoverOAuthEndpoints(cfg.url!, detected.authServerUrl);
  if (discovered) return discovered;
  throw new Error("Could not discover OAuth endpoints from the server response.");
}

async function captureConnectError(
  name: string,
  config: Parameters<typeof connectToServer>[1]
): Promise<Error | null> {
  try {
    const conn = await connectToServer(name, config, {
      signal: AbortSignal.timeout(20000),
    });
    await conn.transport.close();
    return null;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function openInBrowser(url: string): Promise<void> {
  // Only the desktop (Electrobun) runtime may import `electrobun/bun`; in web
  // mode the client opens the URL with window.open instead.
  if (process.env.TESTEIYA_RUNTIME !== "desktop") return;
  try {
    const { Utils } = await import("electrobun/bun");
    Utils.openExternal(url);
  } catch (err) {
    console.warn(
      "[mcp-oauth] openExternal failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
