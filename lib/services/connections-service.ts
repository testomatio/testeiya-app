import { makeAutoObservable, reaction, runInAction } from "mobx";
import { toast } from "sonner";
import { getJson, postJson } from "./http";
import type {
  CatalogService,
  McpConnectionStatus,
  McpServer,
  OauthState,
} from "./types";
import type { RootStore } from "./root-store";

const OAUTH_POLL_MS = 2000;

/**
 * Connections (MCP) business logic for the active session: list servers + the
 * install catalog, enable/disable, add (from catalog or custom), remove, and
 * the OAuth sign-in flow for remote services. Also tracks live connection
 * status (derived from the running session's MCP tools, fed via `setRuntime`).
 * Reloads automatically when the session changes. Views only read/call this.
 */
export class ConnectionsService {
  servers: McpServer[] = [];
  catalog: CatalogService[] = [];
  loading = false;
  busy: string | null = null;
  /** Server whose OAuth flow is currently running. */
  authBusy: string | null = null;
  /** MCP tool names exposed by the running agent session (for live status). */
  runtimeTools: string[] = [];
  /** True once a session has reported its MCP tools (so "disconnected" is real). */
  runtimeLoaded = false;

  // public so it's excluded from the autoBind/observable map (privates are omitted)
  oauthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(readonly root: RootStore) {
    makeAutoObservable(this, { root: false, oauthTimer: false }, { autoBind: true });
    reaction(
      () => this.root.sessionId,
      () => void this.load()
    );
  }

  get sessionId(): string | null {
    return this.root.sessionId;
  }

  get configuredNames(): Set<string> {
    return new Set(this.servers.map((s) => s.name));
  }

  /** Live status of a configured server, derived from the session's MCP tools. */
  connectionStatus(name: string): McpConnectionStatus {
    if (!this.runtimeLoaded) return "unknown";
    const prefix = `mcp_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_`;
    if (this.runtimeTools.some((t) => t.toLowerCase().startsWith(prefix))) {
      return "connected";
    }
    return "disconnected";
  }

  /** Fed from the WS hook's session_created event (tool names + loaded flag). */
  setRuntime(tools: string[], loaded: boolean): void {
    this.runtimeTools = tools;
    this.runtimeLoaded = loaded;
  }

  async load(): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) {
      runInAction(() => {
        this.servers = [];
      });
      return;
    }
    runInAction(() => {
      this.loading = true;
    });
    try {
      const [serversData, catalogData] = await Promise.all([
        getJson<{ servers?: McpServer[] }>(
          `/api/mcp?session=${encodeURIComponent(sessionId)}`
        ),
        getJson<{ services?: CatalogService[] }>("/api/mcp/catalog").catch(
          () => ({ services: [] as CatalogService[] })
        ),
      ]);
      runInAction(() => {
        this.servers = serversData.servers ?? [];
        this.catalog = catalogData.services ?? [];
      });
    } catch {
      runInAction(() => {
        this.servers = [];
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async toggle(server: string, enabled: boolean): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    // optimistic
    runInAction(() => {
      this.servers = this.servers.map((s) =>
        s.name === server ? { ...s, enabled } : s
      );
    });
    try {
      const data = await postJson<{ servers?: McpServer[] }>("/api/mcp", {
        session: sessionId,
        server,
        enabled,
      });
      runInAction(() => {
        this.servers = data.servers ?? [];
      });
      toast.success(
        `${server} ${enabled ? "enabled" : "disabled"} — applies on next session`
      );
    } catch (err) {
      runInAction(() => {
        this.servers = this.servers.map((s) =>
          s.name === server ? { ...s, enabled: !enabled } : s
        );
      });
      toast.error(
        err instanceof Error ? err.message : "Failed to update MCP server"
      );
    }
  }

  async add(payload: Record<string, unknown>, label: string): Promise<boolean> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return false;
    try {
      const data = await postJson<{ servers?: McpServer[] }>("/api/mcp/add", {
        session: sessionId,
        ...payload,
      });
      runInAction(() => {
        this.servers = data.servers ?? [];
      });
      toast.success(`${label} added — applies on next session`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add MCP server");
      return false;
    }
  }

  async remove(server: string): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    runInAction(() => {
      this.busy = server;
    });
    try {
      const data = await postJson<{ servers?: McpServer[] }>("/api/mcp/remove", {
        session: sessionId,
        server,
      });
      runInAction(() => {
        this.servers = data.servers ?? [];
      });
      toast.success(`${server} removed`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove MCP server"
      );
    } finally {
      runInAction(() => {
        this.busy = null;
      });
    }
  }

  /**
   * Run the OAuth sign-in for a remote service. The server discovers endpoints,
   * opens the browser, and finishes in the background; we open the auth URL (web
   * mode) and poll until done. The token applies on the next session start.
   */
  async authenticate(server: string): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    runInAction(() => {
      this.authBusy = server;
    });
    try {
      const data = await postJson<OauthState>("/api/mcp/oauth/start", {
        session: sessionId,
        server,
      });
      if (data.error) throw new Error(data.error);
      // Desktop opens the browser server-side; in a plain browser we open it too.
      if (data.authUrl && typeof window !== "undefined") {
        window.open(data.authUrl, "_blank", "noopener");
      }
      if (data.status === "done") {
        await this.finishOauth(server);
        return;
      }
      this.startOauthPoll(sessionId, server);
    } catch (err) {
      runInAction(() => {
        this.authBusy = null;
      });
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  private startOauthPoll(sessionId: string, server: string): void {
    this.stopOauthPoll();
    this.oauthTimer = setInterval(
      () => void this.pollOauth(sessionId, server),
      OAUTH_POLL_MS
    );
  }

  private stopOauthPoll(): void {
    if (this.oauthTimer) {
      clearInterval(this.oauthTimer);
      this.oauthTimer = null;
    }
  }

  private async pollOauth(sessionId: string, server: string): Promise<void> {
    let data: OauthState;
    try {
      data = await getJson<OauthState>(
        `/api/mcp/oauth/status?session=${encodeURIComponent(sessionId)}&server=${encodeURIComponent(server)}`
      );
    } catch {
      return; // transient — keep polling
    }
    if (data.status === "done") {
      await this.finishOauth(server);
      return;
    }
    if (data.status === "error") {
      this.stopOauthPoll();
      runInAction(() => {
        this.authBusy = null;
      });
      toast.error(data.error || "Authentication failed");
    }
  }

  private async finishOauth(server: string): Promise<void> {
    this.stopOauthPoll();
    runInAction(() => {
      this.authBusy = null;
    });
    await this.load();
    toast.success(
      `${server} authenticated — start a new session (clear chat) to connect`
    );
  }
}
