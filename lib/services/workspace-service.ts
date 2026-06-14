import { makeAutoObservable, reaction, runInAction } from "mobx";
import { toast } from "sonner";
import { getJson, postJson } from "./http";
import type {
  OpenFile,
  TreeNode,
  WorkspaceTree,
  WorkspaceProjectMeta,
  SyncAction,
  SyncResult,
} from "./types";
import type { RootStore } from "./root-store";

// A freshly-opened project pulls its tests in the background; cover that window
// generously (the very first pull can take a while). Polling stops as soon as
// files appear, so a high cap is harmless.
const MAX_EMPTY_RETRIES = 24;
const EMPTY_RETRY_MS = 2500;

/**
 * Workspace business logic: the open-file editor state, the project file tree
 * (load + auto-poll-while-empty + expansion), and opening a local folder as the
 * workspace. The view (WorkspaceSection / MarkdownEditor) only reads/calls this.
 */
export class WorkspaceService {
  openFile: OpenFile | null = null;
  tree: TreeNode[] = [];
  treeLoading = false;
  treeError: string | null = null;
  expanded = new Set<string>();

  // Files written this session (agent write/edit or manual editor saves).
  // "created" (new file) stays sticky over later edits; "changed" otherwise.
  changedFiles = new Map<string, "created" | "changed">();
  // When true, the tree is pruned to only changed/created files.
  changedOnly = false;

  // Workspace classification (from the tree response): where manual tests live
  // (`""` root, `.testeiya/manual-tests`, or null), and the linked project.
  manualTestsDir: string | null = null;
  isProject = false;
  project: WorkspaceProjectMeta | null = null;

  // Sync (check-tests pull/push) state.
  syncing: SyncAction | null = null;
  syncError: string | null = null;

  // True while polling an empty workspace that is still pulling tests in the
  // background (drives a "loading tests" hint instead of an "empty" message).
  awaitingTests = false;

  // non-observable internals (public so they can be excluded in the overrides
  // map — `keyof this` omits private members)
  keyCounter = 0;
  emptyRetries = 0;
  retryTimer: ReturnType<typeof setTimeout> | null = null;
  seeded = false;

  constructor(readonly root: RootStore) {
    makeAutoObservable(
      this,
      {
        root: false,
        keyCounter: false,
        emptyRetries: false,
        retryTimer: false,
        seeded: false,
      },
      { autoBind: true }
    );

    // Reload the tree whenever the active session changes; reset view state.
    reaction(
      () => this.root.sessionId,
      () => {
        this.resetForSession();
        if (this.root.sessionId) void this.loadTree();
      }
    );
  }

  get sessionId(): string | null {
    return this.root.sessionId;
  }

  // --- editor (open file) ---
  open(
    path: string,
    initialContent?: string,
    opts?: { fullHeight?: boolean; scrollToText?: string }
  ) {
    this.openFile = {
      path,
      initialContent,
      fullHeight: opts?.fullHeight,
      scrollToText: opts?.scrollToText,
      key: ++this.keyCounter,
    };
  }

  close() {
    this.openFile = null;
  }

  setFullHeight(fullHeight: boolean) {
    if (this.openFile) this.openFile = { ...this.openFile, fullHeight };
  }

  /** All file paths in the tree (relative to cwd), for clickable-filename lookup. */
  get filePaths(): Set<string> {
    const set = new Set<string>();
    collectFilePaths(this.tree, set);
    return set;
  }

  /**
   * Resolve an arbitrary inline-code string to a workspace file path, so the
   * chat can turn mentioned filenames into clickable links. Matches a full
   * relative path, else a unique basename/suffix; returns null when it isn't an
   * unambiguous file in the tree.
   */
  resolveFilePath(text: string): string | null {
    const cleaned = text.trim().replace(/^\.\//, "");
    if (!cleaned) return null;
    const paths = this.filePaths;
    if (paths.has(cleaned)) return cleaned;
    const suffix = `/${cleaned}`;
    let match: string | null = null;
    for (const p of paths) {
      if (!p.endsWith(suffix)) continue;
      if (match) return null;
      match = p;
    }
    return match;
  }

  /** Re-fetch the tree (e.g. after the agent writes a file). */
  triggerRefresh() {
    void this.loadTree();
  }

  /**
   * Record a file written this session (agent or manual save) and refresh the
   * tree. Status is derived from the pre-refresh tree: a path not yet present
   * is "created", an existing one is "changed". "created" is sticky.
   */
  markChanged(path: string) {
    if (!this.changedFiles.has(path)) {
      const next = new Map(this.changedFiles);
      next.set(path, treeHasPath(this.tree, path) ? "changed" : "created");
      this.changedFiles = next;
    }
    void this.loadTree();
  }

  toggleChangedOnly() {
    this.changedOnly = !this.changedOnly;
    if (!this.changedOnly) return;
    const next = new Set(this.expanded);
    for (const path of this.changedFiles.keys()) expandAncestors(next, path);
    this.expanded = next;
  }

  get visibleTree(): TreeNode[] {
    if (!this.changedOnly) return this.tree;
    return filterChangedTree(this.tree, this.changedFiles);
  }

  // --- file tree ---
  async loadTree() {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    this.treeLoading = true;
    this.treeError = null;
    try {
      const data = await getJson<WorkspaceTree>(
        `/api/files/tree?session=${encodeURIComponent(sessionId)}`
      );
      runInAction(() => {
        this.tree = data.nodes ?? [];
        this.manualTestsDir = data.manualTestsDir ?? null;
        this.isProject = data.isProject ?? false;
        this.project = data.project ?? null;
        this.seedExpansion();
        this.scheduleEmptyRetry();
      });
    } catch (e) {
      runInAction(() => {
        this.handleLoadError(e);
      });
    } finally {
      runInAction(() => {
        this.treeLoading = false;
      });
    }
  }

  setExpanded(next: Set<string>) {
    this.expanded = next;
  }

  toggleFolder(path: string) {
    const next = new Set(this.expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this.expanded = next;
  }

  /** Row click: folder → toggle; file → open full-height (hides the chat). */
  openPath(path: string) {
    if (containsFolder(this.tree, path)) {
      this.toggleFolder(path);
      return;
    }
    this.open(path, undefined, { fullHeight: true });
  }

  /**
   * Open a local directory as the workspace and switch to its session.
   *
   * With `presetPath` (a path typed in Settings) we open it directly — that
   * works anywhere. Without one we use the native folder picker, which only
   * exists in the Electrobun desktop app; in web/standalone the server reports
   * `available: false` and we do nothing (no browser fallback — folder
   * switching simply isn't a web feature).
   */
  async openFolder(presetPath?: string) {
    let path: string | null = presetPath?.trim() || null;
    if (!path) {
      try {
        const data = await postJson<{ available?: boolean; path?: string | null }>(
          "/api/workspace/pick"
        );
        if (!data.available) return; // web — no native picker
        path = data.path ?? null;
      } catch {
        return;
      }
    }
    if (!path) return; // cancelled
    try {
      const data = await postJson<{ sessionId: string; cwd: string }>(
        "/api/workspace",
        { path }
      );
      toast.success(`Opening ${data.cwd}`);
      this.root.navigate(data.sessionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open workspace");
    }
  }

  /**
   * Run check-tests for the workspace's manual tests. Pull refreshes the tree
   * once it lands; push uploads local edits. The server resolves the project
   * token (connected account, else the folder's .env).
   */
  async sync(action: SyncAction) {
    const sessionId = this.root.sessionId;
    if (!sessionId || this.syncing) return;
    this.syncing = action;
    this.syncError = null;
    try {
      await postJson<SyncResult>("/api/workspace/sync", { session: sessionId, action });
      let message = "Pushed tests to Testomat.io";
      if (action === "pull") message = "Pulled tests from Testomat.io";
      toast.success(message);
      if (action === "pull") {
        runInAction(() => {
          this.seeded = false;
        });
        await this.loadTree();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runInAction(() => {
        this.syncError = msg;
      });
      toast.error(msg);
    } finally {
      runInAction(() => {
        this.syncing = null;
      });
    }
  }

  /**
   * Cold-load entry for web mode: if the server has a `TESTEIYA_WORKSPACE`
   * configured, switch to its session. No-op when a session is already active
   * or none is configured.
   */
  async openDefault() {
    if (this.root.sessionId) return;
    try {
      const data = await getJson<{ sessionId: string | null }>("/api/workspace/default");
      if (data.sessionId && !this.root.sessionId) this.root.navigate(data.sessionId);
    } catch {
      // best-effort — no default workspace configured.
    }
  }

  // --- internals ---
  private resetForSession() {
    this.tree = [];
    this.treeError = null;
    this.expanded = new Set();
    this.changedFiles = new Map();
    this.changedOnly = false;
    this.manualTestsDir = null;
    this.isProject = false;
    this.project = null;
    this.syncError = null;
    this.awaitingTests = false;
    this.seeded = false;
    this.emptyRetries = 0;
    this.clearRetry();
  }

  private clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private seedExpansion() {
    if (this.seeded || this.tree.length === 0) return;
    const s = new Set<string>();
    for (const n of this.tree) if (n.kind === "folder") s.add(n.path);
    expandAncestors(s, this.manualTestsDir);
    this.expanded = s;
    this.seeded = true;
  }

  // A just-opened project syncs its markdown in the background, so the first
  // tree fetch can land before any files exist. Poll a few times while empty.
  private scheduleEmptyRetry() {
    if (this.tree.length > 0) {
      this.clearRetry();
      this.emptyRetries = 0;
      this.awaitingTests = false;
      return;
    }
    this.scheduleRetry();
  }

  // A just-created session's workspace dir may not exist yet while the
  // background test sync runs (the server answers 410 until then). Treat that
  // like the empty case — retry instead of sticking an error — and only
  // surface the error once retries are exhausted.
  private handleLoadError(e: unknown) {
    if (this.emptyRetries < MAX_EMPTY_RETRIES) {
      this.scheduleRetry();
      return;
    }
    this.awaitingTests = false;
    this.treeError = e instanceof Error ? e.message : String(e);
  }

  private scheduleRetry() {
    this.clearRetry();
    if (!this.root.sessionId || this.emptyRetries >= MAX_EMPTY_RETRIES) {
      this.awaitingTests = false;
      return;
    }
    this.awaitingTests = true;
    this.retryTimer = setTimeout(() => {
      this.emptyRetries += 1;
      void this.loadTree();
    }, EMPTY_RETRY_MS);
  }
}

function collectFilePaths(nodes: TreeNode[], set: Set<string>): void {
  for (const n of nodes) {
    if (n.kind === "file") set.add(n.path);
    if (n.children) collectFilePaths(n.children, set);
  }
}

function containsFolder(nodes: TreeNode[], path: string): boolean {
  for (const n of nodes) {
    if (n.path === path) return n.kind === "folder";
    if (n.children && path.startsWith(n.path + "/")) {
      return containsFolder(n.children, path);
    }
  }
  return false;
}

function treeHasPath(nodes: TreeNode[], path: string): boolean {
  for (const n of nodes) {
    if (n.path === path) return true;
    if (n.children && path.startsWith(n.path + "/") && treeHasPath(n.children, path)) {
      return true;
    }
  }
  return false;
}

function filterChangedTree(
  nodes: TreeNode[],
  changed: Map<string, "created" | "changed">
): TreeNode[] {
  const kept: TreeNode[] = [];
  for (const n of nodes) {
    if (n.kind === "file") {
      if (changed.has(n.path)) kept.push(n);
      continue;
    }
    const children = filterChangedTree(n.children ?? [], changed);
    if (children.length > 0) kept.push({ ...n, children });
  }
  return kept;
}

// Expand the manual-tests dir and every folder on the way to it (e.g.
// `.testeiya` then `.testeiya/manual-tests`) so pulled tests show on first load.
function expandAncestors(set: Set<string>, dir: string | null): void {
  if (!dir) return;
  const segments = dir.split("/");
  let acc = "";
  for (const segment of segments) {
    acc = acc ? `${acc}/${segment}` : segment;
    set.add(acc);
  }
}
