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
  FileStatus,
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

  // Manual-test files that differ from the last Testomat.io sync (i.e. not yet
  // pushed). Rebuilt on each tree load by merging the server's snapshot diff with
  // `sessionEdits` (files this client just wrote), so a save shows instantly even
  // before the server can confirm it.
  changedFiles = new Map<string, FileStatus>();
  // Files written by this client since the last sync. Kept across tree reloads
  // (which the server may not yet reflect) and cleared on pull/push.
  sessionEdits = new Map<string, FileStatus>();
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

  // The node awaiting delete confirmation (drives the confirm dialog), and
  // whether its delete is in flight.
  pendingDelete: TreeNode | null = null;
  deleting = false;

  // The node being renamed (drives the rename dialog), its edited value, and
  // whether the rename is in flight.
  renaming: TreeNode | null = null;
  renameValue = "";
  renamingBusy = false;

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
        sessionEdits: false,
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
   * Flag a just-written file (agent or manual save) optimistically and refresh
   * the tree. The reload reconciles against the server's snapshot diff, which is
   * authoritative — a new path shows "created", an existing one "changed".
   */
  markChanged(path: string) {
    const status: FileStatus = treeHasPath(this.tree, path) ? "changed" : "created";
    this.sessionEdits.set(path, status);
    const next = new Map(this.changedFiles);
    if (!next.has(path)) next.set(path, status);
    this.changedFiles = next;
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
        this.changedFiles = this.mergedStatuses();
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

  /** Row click: folder → toggle; file → open; test node → open file + scroll to anchor. */
  openPath(path: string, anchor?: string) {
    if (containsFolder(this.tree, path)) {
      this.toggleFolder(path);
      return;
    }
    this.open(path, undefined, { fullHeight: true, scrollToText: anchor });
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
      // Both directions re-baseline the server snapshot, so local == remote: drop
      // the session edits and reload to clear the changed markers.
      runInAction(() => {
        this.sessionEdits.clear();
        if (action === "pull") this.seeded = false;
      });
      await this.loadTree();
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

  // --- delete (file/test/folder + remote suite/test) ---
  requestDelete(node: TreeNode) {
    this.pendingDelete = node;
  }

  cancelDelete() {
    this.pendingDelete = null;
  }

  /**
   * Delete the pending node locally AND its Testomat.io counterpart (a file's
   * suite, a test, or every suite under a folder). The server removes the remote
   * resource first; on failure nothing is removed on disk, so we leave the tree
   * untouched and surface the error.
   */
  async confirmDelete() {
    const node = this.pendingDelete;
    const sessionId = this.root.sessionId;
    if (!node || !sessionId || this.deleting) return;
    this.deleting = true;
    try {
      const body: { session: string; path: string; anchor?: string } = {
        session: sessionId,
        path: node.path,
      };
      if (node.kind === "test") body.anchor = node.anchor;
      await postJson("/api/files/delete", body);
      runInAction(() => {
        this.afterDelete(node);
      });
      toast.success(`Deleted ${node.name}`);
      await this.loadTree();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      runInAction(() => {
        this.pendingDelete = null;
        this.deleting = false;
      });
    }
  }

  // --- rename (file/folder on disk; a test's heading + its Testomat.io title) ---
  requestRename(node: TreeNode) {
    this.renaming = node;
    this.renameValue = node.name;
  }

  setRenameValue(value: string) {
    this.renameValue = value;
  }

  cancelRename() {
    this.renaming = null;
  }

  /**
   * Rename the node: a file/folder is renamed on disk; a test's title heading is
   * rewritten and (when the test has an id and a project is linked) pushed to
   * Testomat.io. The server syncs the remote title first; on failure nothing
   * changes and the error is surfaced.
   */
  async confirmRename() {
    const node = this.renaming;
    const sessionId = this.root.sessionId;
    const newName = this.renameValue.trim();
    if (!node || !sessionId || this.renamingBusy) return;
    if (!newName || newName === node.name) {
      this.cancelRename();
      return;
    }
    this.renamingBusy = true;
    try {
      const body: { session: string; path: string; newName: string; anchor?: string } = {
        session: sessionId,
        path: node.path,
        newName,
      };
      if (node.kind === "test") body.anchor = node.anchor;
      const res = await postJson<{ ok: boolean; path: string }>("/api/files/rename", body);
      runInAction(() => {
        this.afterRename(node, res.path);
      });
      toast.success(`Renamed to ${newName}`);
      await this.loadTree();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      runInAction(() => {
        this.renaming = null;
        this.renamingBusy = false;
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
  // Merge the server's snapshot diff with this client's session edits. The
  // server wins on type; session edits are kept only while their file still
  // exists in the tree (a deleted file drops out).
  private mergedStatuses(): Map<string, FileStatus> {
    const merged = new Map<string, FileStatus>();
    const paths = this.filePaths;
    for (const [path, status] of this.sessionEdits) {
      if (paths.has(path)) merged.set(path, status);
    }
    for (const [path, status] of collectStatuses(this.tree)) merged.set(path, status);
    return merged;
  }

  // Reconcile editor + changed-file state after a node leaves the tree. A test
  // delete keeps its file (refresh it if open); a file/folder delete drops the
  // open editor and any changed-file markers under the removed path.
  private afterDelete(node: TreeNode) {
    if (node.kind === "test") {
      if (this.openFile?.path === node.path) {
        this.open(node.path, undefined, { fullHeight: this.openFile.fullHeight });
      }
      return;
    }
    const open = this.openFile?.path;
    if (open && (open === node.path || open.startsWith(node.path + "/"))) this.close();
    const next = new Map(this.changedFiles);
    for (const key of next.keys()) {
      if (key === node.path || key.startsWith(node.path + "/")) next.delete(key);
    }
    this.changedFiles = next;
  }

  // Reconcile the open editor after a node is renamed. A test rename keeps the
  // file path (refresh it if open); a file rename moves the editor to the new
  // path; a folder rename closes any editor opened from within it.
  private afterRename(node: TreeNode, newPath: string) {
    const open = this.openFile;
    if (!open) return;
    if (node.kind === "test") {
      if (open.path === node.path) this.open(node.path, undefined, { fullHeight: open.fullHeight });
      return;
    }
    if (open.path === node.path) {
      this.open(newPath, undefined, { fullHeight: open.fullHeight });
      return;
    }
    if (open.path.startsWith(node.path + "/")) this.close();
  }

  private resetForSession() {
    this.tree = [];
    this.treeError = null;
    this.expanded = new Set();
    this.changedFiles = new Map();
    this.sessionEdits = new Map();
    this.changedOnly = false;
    this.manualTestsDir = null;
    this.isProject = false;
    this.project = null;
    this.syncError = null;
    this.awaitingTests = false;
    this.pendingDelete = null;
    this.deleting = false;
    this.renaming = null;
    this.renameValue = "";
    this.renamingBusy = false;
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

function collectStatuses(nodes: TreeNode[]): Map<string, FileStatus> {
  const map = new Map<string, FileStatus>();
  walk(nodes);
  return map;

  function walk(items: TreeNode[]): void {
    for (const n of items) {
      if (n.status) map.set(n.path, n.status);
      if (n.children) walk(n.children);
    }
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
