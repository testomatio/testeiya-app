import { makeAutoObservable, reaction, runInAction } from "mobx";
import { getJson, postJson, del } from "./http";
import {
  DEFAULT_BASE_URL,
  buildSignInUrl,
  openExternalUrl,
  normalizeBaseUrl,
} from "../testomatio-url";
import type {
  CreatedSession,
  CurrentProject,
  TestomatioAuthState,
  TestomatioProject,
} from "./types";
import type { RootStore } from "./root-store";

// Loading the project list can take 10s+ on large accounts, so we cache the
// last connected state (public, token-free) in localStorage and seed from it.
const CACHE_KEY = "testeiya.testomatio.authState.v1";

type Status = "idle" | "loading" | "connecting";

/** Project resources that have an in-app widget + a v2 list endpoint. */
export type ProjectResource = "tests" | "runs" | "plans" | "requirements";

/**
 * Project (Testomat.io) business logic: connection status, connect/disconnect,
 * project selection (creates the agent session), and auto-restore of the last
 * project. Persists the connected state to localStorage via a reaction.
 */
export class ProjectService {
  authState: TestomatioAuthState | null = null;
  status: Status = "idle";
  error: string | null = null;
  restoring = false;

  // The project the active session is open on (from session metadata), with live
  // test/run counts. Drives the Project sidebar section.
  currentProject: CurrentProject | null = null;

  // Which project resource (if any) is open as a full-height widget in the main
  // content area. Mutually exclusive with the workspace's open file.
  openResource: ProjectResource | null = null;

  // Bumped to make open resource widgets revalidate (stale-while-revalidate)
  // and to re-read the counters after the agent, a click, or a refocus.
  refreshTick = 0;

  // public so they can be excluded in the overrides map (`keyof this` omits privates)
  inFlight: Promise<TestomatioAuthState> | null = null;
  restoreAttempted = false;

  constructor(readonly root: RootStore) {
    this.authState = readCache();
    makeAutoObservable(
      this,
      { root: false, inFlight: false, restoreAttempted: false },
      { autoBind: true }
    );
    // Persist the connected state whenever it changes.
    reaction(
      () => this.authState,
      (state) => writeCache(state)
    );
    // Reflect the active session's project (title + counts) in the sidebar;
    // drop any open resource view when switching sessions.
    reaction(
      () => this.root.sessionId,
      () => {
        this.openResource = null;
        void this.loadCurrentProject();
      }
    );
    // Opening a file in the editor takes over the main area, so close the
    // resource widget view (the two overlays are mutually exclusive).
    reaction(
      () => this.root.workspace.openFile,
      (file) => {
        if (file) this.openResource = null;
      }
    );
    // Re-read data when the user returns to the app (edits may have happened
    // in the Testomat.io web UI in another tab).
    if (typeof window !== "undefined") {
      window.addEventListener("visibilitychange", this.onVisible);
    }
  }

  get connected(): boolean {
    return !!this.authState?.connected;
  }
  get projects(): TestomatioProject[] {
    return this.authState?.projects ?? [];
  }
  get selectedProjectId(): string | undefined {
    return this.authState?.selectedProjectId;
  }
  get rejected(): boolean {
    return !!this.authState?.rejected;
  }
  get baseUrl(): string {
    return this.authState?.baseUrl || DEFAULT_BASE_URL;
  }
  get signInUrl(): string {
    return this.authState?.signInUrl || buildSignInUrl(this.baseUrl);
  }
  /** External Testomat.io links for the current project (or null when none open). */
  get currentLinks(): {
    project: string;
    tests: string;
    runs: string;
    plans: string;
    requirements: string;
  } | null {
    const p = this.currentProject;
    if (!p) return null;
    const root = `${p.baseUrl}/projects/${encodeURIComponent(p.id)}`;
    // The project root IS the tests view, so tests links to `root` (no `/tests`).
    return {
      project: root,
      tests: root,
      runs: `${root}/runs`,
      plans: `${root}/plans`,
      requirements: `${root}/requirements`,
    };
  }

  /** Fetch connection status + project list (de-duped across concurrent calls). */
  refreshStatus(): Promise<TestomatioAuthState> {
    if (this.inFlight) return this.inFlight;
    runInAction(() => {
      this.status = "loading";
    });
    this.inFlight = (async () => {
      try {
        const state = await getJson<TestomatioAuthState>("/api/auth/testomatio");
        runInAction(() => {
          this.authState = state;
        });
        return state;
      } finally {
        runInAction(() => {
          this.status = "idle";
        });
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /** Connect with a pasted JWT. Returns the connected state + project list. */
  async connect(token: string, baseUrl?: string): Promise<TestomatioAuthState> {
    runInAction(() => {
      this.status = "connecting";
      this.error = null;
    });
    try {
      const state = await postJson<TestomatioAuthState>("/api/auth/testomatio", {
        token,
        baseUrl,
      });
      runInAction(() => {
        this.authState = state;
      });
      return state;
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : String(e);
      });
      throw e;
    } finally {
      runInAction(() => {
        this.status = "idle";
      });
    }
  }

  /** Forget the stored token. */
  async disconnect(): Promise<void> {
    runInAction(() => {
      this.authState = null;
    });
    await del("/api/auth/testomatio").catch(() => {});
  }

  /**
   * Create an agent session for a project and switch to it. Passes the current
   * session so the server can decide whether to overlay the project into the
   * user's open folder or use a dedicated per-project workspace.
   */
  async selectProject(projectId: string): Promise<CreatedSession> {
    const session = await postJson<CreatedSession>(
      "/api/auth/testomatio/session",
      { projectId, fromSession: this.root.sessionId ?? undefined }
    );
    this.root.navigate(session.sessionId);
    return session;
  }

  /** On a cold load with no session, reopen the last-used project (once). */
  async restoreLast(): Promise<void> {
    if (this.restoreAttempted) return;
    this.restoreAttempted = true;
    const cached = readCache();
    const last = cached?.selectedProjectId;
    if (!cached?.connected || !last) return;
    runInAction(() => {
      this.restoring = true;
    });
    try {
      await this.selectProject(last);
    } catch {
      runInAction(() => {
        this.restoring = false;
      });
    }
  }

  /** Open the Testomat.io sign-in page in the user's real browser. */
  openSignIn(): void {
    void openExternalUrl(this.signInUrl);
  }

  /** Open any Testomat.io URL (project / tests / runs) in the real browser. */
  openExternal(url: string): void {
    void openExternalUrl(url);
  }

  /** Show a project resource (tests / runs / plans) as an in-app widget view. */
  showResource(resource: ProjectResource): void {
    // Closing any open file hands the main area to the widget view.
    this.root.workspace.close();
    this.openResource = resource;
    this.refresh();
  }

  /**
   * Revalidate stale-while-revalidate: bump the widget tick (open resource
   * widgets re-fetch in the background) and re-read the counters in place.
   */
  refresh(): void {
    this.refreshTick++;
    void this.refreshCounts();
  }

  /** Close the resource widget view, returning to the chat. */
  closeResource(): void {
    this.openResource = null;
  }

  /**
   * Resolve the active session's project from session metadata, then fetch its
   * test/run counts from the Testomat.io v2 API. No-op (clears) when there is no
   * session or the session isn't bound to a project.
   */
  async loadCurrentProject(): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) {
      runInAction(() => {
        this.currentProject = null;
      });
      return;
    }
    let meta: AgentMeta;
    try {
      meta = await getJson<AgentMeta>(`/api/agent/${encodeURIComponent(sessionId)}`);
    } catch {
      return;
    }
    const project = meta.projects?.find((p) => p.status === "ok") ?? meta.projects?.[0];
    if (!project) {
      runInAction(() => {
        this.currentProject = null;
      });
      return;
    }
    const baseUrl = normalizeBaseUrl(meta.backendUrl || this.baseUrl);
    runInAction(() => {
      this.currentProject = {
        id: project.slug,
        title: project.title,
        baseUrl,
        testsCount: null,
        runsCount: null,
      };
    });
    const [tests, runs] = await Promise.all([
      fetchTotal(sessionId, "tests"),
      fetchTotal(sessionId, "runs"),
    ]);
    runInAction(() => {
      if (this.currentProject?.id !== project.slug) return;
      this.currentProject.testsCount = tests;
      this.currentProject.runsCount = runs;
    });
  }

  /**
   * Re-fetch the test/run totals into the existing currentProject without the
   * null-reset loadCurrentProject does on a session switch (which flashes "—").
   */
  async refreshCounts(): Promise<void> {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    const current = this.currentProject;
    if (!current) return;
    const [tests, runs] = await Promise.all([
      fetchTotal(sessionId, "tests"),
      fetchTotal(sessionId, "runs"),
    ]);
    runInAction(() => {
      if (this.currentProject?.id !== current.id) return;
      if (typeof tests === "number") this.currentProject.testsCount = tests;
      if (typeof runs === "number") this.currentProject.runsCount = runs;
    });
  }

  private onVisible(): void {
    if (document.visibilityState !== "visible") return;
    if (!this.root.sessionId) return;
    this.refresh();
  }
}

// The v2 list endpoints return `meta.total` for the full count; a 1-row page is
// enough to read it cheaply. Returns null on any failure (count simply hidden).
async function fetchTotal(
  sessionId: string,
  resource: "tests" | "runs"
): Promise<number | null> {
  try {
    const data = await getJson<{ meta?: { total?: number } }>(
      `/api/testomatio/${resource}?session=${encodeURIComponent(sessionId)}&per_page=1`
    );
    const total = data.meta?.total;
    if (typeof total === "number") return total;
    return null;
  } catch {
    return null;
  }
}

function readCache(): TestomatioAuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TestomatioAuthState;
    if (!parsed?.connected || !Array.isArray(parsed.projects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(state: TestomatioAuthState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (state?.connected && state.projects && state.projects.length > 0) {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    } else {
      window.localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    /* ignore quota / disabled storage */
  }
}

interface AgentMeta {
  projects?: { slug: string; title: string; status: "ok" | "error" }[];
  backendUrl?: string;
}
