import { makeAutoObservable, reaction, runInAction } from "mobx";
import { toast } from "sonner";
import { getJson, postJson } from "./http";
import type {
  OpenFile,
  TreeNode,
  WorkspaceTree,
  WorkspaceProjectMeta,
  WorkspaceType,
  WorkspaceTypeEntry,
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

// Suite files; and how long a burst of saves coalesces before an auto-push.
const TEST_MD_RE = /\.test\.md$/i;
const AUTO_PUSH_DEBOUNCE_MS = 1500;

/**
 * Workspace business logic: the open-file editor state, the project file tree
 * (load + auto-poll-while-empty + expansion), and opening a local folder as the
 * workspace. The view (WorkspaceSection / MarkdownEditor) only reads/calls this.
 */
export class WorkspaceService {
  openFile: OpenFile | null = null;
  // Bumped whenever the open file should be re-read from disk (the agent may
  // have rewritten it while it was on screen). The editor ignores a reload that
  // would clobber unsaved edits.
  fileReloadToken = 0;
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
  // The workspace's checked-out git branch (null when not a git repo / detached).
  branch: string | null = null;

  // Type filtering: the root classification, the selectable views (a toggle is
  // shown when more than one), and the active view (null → the server default).
  workspaceType: WorkspaceType | null = null;
  types: WorkspaceTypeEntry[] = [];
  activeType: WorkspaceType | null = null;

  // Sync (check-tests pull/push) state.
  syncing: SyncAction | null = null;
  syncError: string | null = null;

  // The node awaiting delete confirmation (drives the confirm dialog).
  pendingDelete: TreeNode | null = null;

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
  // Suite files saved since the last auto-push, and the debounce timer that
  // coalesces a burst of saves into one background push.
  autoPushPending = new Set<string>();
  autoPushTimer: ReturnType<typeof setTimeout> | null = null;

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
        autoPushPending: false,
        autoPushTimer: false,
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

  /** Re-read the open file from disk (agent edits land while it's on screen). */
  reloadOpenFile() {
    if (!this.openFile) return;
    this.fileReloadToken++;
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
    this.queueAutoPush(path);
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

  setActiveType(type: WorkspaceType) {
    if (type === this.activeType) return;
    this.activeType = type;
    this.seeded = false;
    void this.loadTree();
  }

  // --- file tree ---
  async loadTree() {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    this.treeLoading = true;
    this.treeError = null;
    try {
      let url = `/api/files/tree?session=${encodeURIComponent(sessionId)}`;
      if (this.activeType) url += `&type=${this.activeType}`;
      const data = await getJson<WorkspaceTree>(url);
      runInAction(() => {
        this.tree = data.nodes ?? [];
        this.changedFiles = this.mergedStatuses();
        this.manualTestsDir = data.manualTestsDir ?? null;
        this.isProject = data.isProject ?? false;
        this.project = data.project ?? null;
        this.branch = data.branch ?? null;
        this.workspaceType = data.type ?? null;
        this.types = data.types ?? [];
        this.activeType = data.activeType ?? this.activeType;
        this.seedExpansion();
        this.scheduleEmptyRetry();
      });
      // Keep the workspace-context chips in step with the tree (the agent may
      // have dropped new folders into .testeiya since the last load).
      void this.root.context.load();
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
   * Reveal a `.testeiya` context folder in the sidebar tree: switch to a view
   * that shows it (the manual view for the manual-tests dir, else the Files
   * view) and expand every folder on the way to it.
   */
  async revealFolder(dir: string) {
    const target = this.viewFor(dir);
    if (target && target !== this.activeType) {
      this.activeType = target;
      this.seeded = false;
      await this.loadTree();
    }
    const next = new Set(this.expanded);
    expandAncestors(next, dir);
    this.expanded = next;
  }

  /**
   * Run check-tests for the workspace's manual tests. A bare push uploads only
   * the changed files (partial push); a bare pull fetches every suite (with
   * automated tests). `opts.files`/`opts.suiteIds` narrow it to a single suite.
   * The server resolves the project token (connected account, else the .env).
   */
  async sync(action: SyncAction, opts?: SyncOptions) {
    const sessionId = this.root.sessionId;
    if (!sessionId || this.syncing) return;
    this.syncing = action;
    this.syncError = null;
    try {
      const body: {
        session: string;
        action: SyncAction;
        files?: string[];
        suiteIds?: string[];
      } = { session: sessionId, action };
      if (opts?.files?.length) body.files = opts.files;
      if (opts?.suiteIds?.length) body.suiteIds = opts.suiteIds;
      await postJson<SyncResult>("/api/workspace/sync", body);
      toast.success(opts?.label || syncMessage(action));
      // A targeted sync re-baselines only its files; a full sync re-baselines all.
      runInAction(() => {
        if (opts?.files?.length) {
          for (const file of opts.files) this.sessionEdits.delete(file);
        } else {
          this.sessionEdits.clear();
        }
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

  /** Push a single suite (its file) to Testomat.io. */
  pushSuite(node: TreeNode) {
    return this.sync("push", {
      files: [node.path],
      label: `Pushed ${suiteLabel(node)} to Testomat.io`,
    });
  }

  /** Pull a single suite from Testomat.io (needs the suite's `@S` id). */
  pullSuite(node: TreeNode) {
    if (!node.suiteId) {
      toast.error("This suite hasn't been pushed yet — nothing to pull.");
      return;
    }
    return this.sync("pull", {
      files: [node.path],
      suiteIds: [node.suiteId],
      label: `Pulled ${suiteLabel(node)} from Testomat.io`,
    });
  }

  // --- delete (file/test/folder + remote suite/test) ---
  requestDelete(node: TreeNode) {
    // A committed plain file is recoverable from git, so skip the prompt and
    // delete it right away. Suites/folders still confirm — their Testomat.io
    // removal can't be undone with git.
    if (canDeleteInstantly(node)) {
      void this.performDelete(node);
      return;
    }
    this.pendingDelete = node;
  }

  cancelDelete() {
    this.pendingDelete = null;
  }

  async confirmDelete() {
    const node = this.pendingDelete;
    if (!node) return;
    this.pendingDelete = null;
    await this.performDelete(node);
  }

  /**
   * Delete a file or folder optimistically: drop it from the tree and toast right
   * away, then remove its Testomat.io suite(s) in the background. On failure the
   * tree is restored and the error surfaced. A committed plain file is
   * recoverable, so its toast says how to bring it back from git. A test isn't a
   * removable tree node (its block is stripped server-side and the file re-opened
   * with fresh content), so it stays on the confirm-then-do path.
   */
  private async performDelete(node: TreeNode) {
    const sessionId = this.root.sessionId;
    if (!sessionId) return;
    if (node.kind === "test") return this.deleteTest(node, sessionId);
    const snapshot = this.tree;
    runInAction(() => {
      this.tree = removeTreeNode(this.tree, node.path);
      this.afterDelete(node);
    });
    if (canDeleteInstantly(node)) {
      toast.success(`Deleted ${node.name}`, {
        description: `Restore it with: git restore "${node.path}"`,
      });
    } else {
      toast.success(`Deleted ${node.name}`);
    }
    try {
      await postJson("/api/files/delete", { session: sessionId, path: node.path });
      await this.loadTree();
      void this.root.context.load();
    } catch (err) {
      runInAction(() => {
        this.tree = snapshot;
      });
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      void this.loadTree();
    }
  }

  private async deleteTest(node: TreeNode, sessionId: string) {
    try {
      await postJson("/api/files/delete", {
        session: sessionId,
        path: node.path,
        anchor: node.anchor,
      });
      runInAction(() => this.afterDelete(node));
      toast.success(`Deleted ${node.name}`);
      await this.loadTree();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
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
   * or none is configured. Returns whether a workspace was opened so the caller
   * can skip the last-project fallback (the env var takes precedence).
   */
  async openDefault(): Promise<boolean> {
    if (this.root.sessionId) return false;
    try {
      const data = await getJson<{ sessionId: string | null }>("/api/workspace/default");
      if (data.sessionId && !this.root.sessionId) {
        this.root.navigate(data.sessionId);
        return true;
      }
    } catch {
      // best-effort — no default workspace configured.
    }
    return false;
  }

  // --- internals ---
  // The view a reveal should switch to so `dir` is actually in the tree; null
  // when the current view already shows it (or no better view exists).
  private viewFor(dir: string): WorkspaceType | null {
    if (this.activeType === "files") return null;
    if (dir === this.manualTestsDir && this.activeType === "manual") return null;
    if (dir === this.manualTestsDir && this.types.some((t) => t.type === "manual")) {
      return "manual";
    }
    if (this.types.some((t) => t.type === "files")) return "files";
    return null;
  }

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
    this.branch = null;
    this.workspaceType = null;
    this.types = [];
    this.activeType = null;
    this.syncError = null;
    this.awaitingTests = false;
    this.pendingDelete = null;
    this.renaming = null;
    this.renameValue = "";
    this.renamingBusy = false;
    this.seeded = false;
    this.emptyRetries = 0;
    this.clearRetry();
    this.autoPushPending.clear();
    if (this.autoPushTimer) {
      clearTimeout(this.autoPushTimer);
      this.autoPushTimer = null;
    }
  }

  // Auto push-on-save: queue the saved suite and (re)arm a debounce so a burst of
  // saves coalesces into one background push. The server only pushes suites that
  // already exist on Testomat.io (carry an `@S` id); local-only drafts are skipped.
  private queueAutoPush(path: string) {
    if (!TEST_MD_RE.test(path)) return;
    this.autoPushPending.add(path);
    this.scheduleAutoPush();
  }

  private scheduleAutoPush() {
    if (this.autoPushTimer) clearTimeout(this.autoPushTimer);
    this.autoPushTimer = setTimeout(() => void this.flushAutoPush(), AUTO_PUSH_DEBOUNCE_MS);
  }

  private async flushAutoPush() {
    this.autoPushTimer = null;
    const sessionId = this.root.sessionId;
    if (!sessionId || this.autoPushPending.size === 0) return;
    // Don't race a manual pull/push; retry once it finishes.
    if (this.syncing) {
      this.scheduleAutoPush();
      return;
    }
    const files = [...this.autoPushPending];
    this.autoPushPending.clear();
    try {
      const res = await postJson<SyncResult>("/api/workspace/sync", {
        session: sessionId,
        action: "push",
        files,
        auto: true,
      });
      if (res.skipped) return;
      runInAction(() => {
        for (const file of files) this.sessionEdits.delete(file);
      });
      await this.loadTree();
      const count = files.length === 1 ? "1 suite" : `${files.length} suites`;
      toast.success(`Pushed ${count} to Testomat.io`);
    } catch {
      // Best-effort background push — the file stays flagged for a manual retry.
    }
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
    const active = this.types.find((t) => t.type === this.activeType);
    // Reveal the active view's focus dir (if it's a subdir).
    expandAncestors(s, active?.dir ?? null);
    // The manual-tests overlay is only surfaced in the manual and files views —
    // reveal the branch to it there so pulled tests are discoverable. The code
    // view is the source repo, so leave it out.
    if (this.activeType === "manual" || this.activeType === "files") {
      expandAncestors(s, this.manualTestsDir);
    }
    // Open the folders that directly hold the manual tests (the suite folders),
    // but only in the manual view — other views stay collapsed so a real repo
    // isn't rendered as a wall of expanded top-level folders.
    if (this.activeType === "manual") {
      expandChildFolders(s, this.tree, this.manualTestsDir ?? active?.dir ?? "");
    }
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

// Expand the immediate folder children of `dir` ("" = tree root), so the suite
// folders inside the manual-tests dir open without expanding their subtrees.
function expandChildFolders(set: Set<string>, tree: TreeNode[], dir: string): void {
  const children = dir === "" ? tree : childrenOf(tree, dir);
  for (const n of children) if (n.kind === "folder") set.add(n.path);
}

function childrenOf(nodes: TreeNode[], path: string): TreeNode[] {
  for (const n of nodes) {
    if (n.path === path) return n.children ?? [];
    if (n.children && path.startsWith(n.path + "/")) return childrenOf(n.children, path);
  }
  return [];
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

// A plain (non-suite) file that git tracks unmodified: deletable without a
// prompt because `git restore` brings it back.
function canDeleteInstantly(node: TreeNode): boolean {
  if (node.kind !== "file" || !node.committed) return false;
  return !TEST_MD_RE.test(node.name) && !node.suiteId;
}

// The tree with the node at `path` (and its subtree) removed — the optimistic
// counterpart to a delete, before the server confirms it.
function removeTreeNode(nodes: TreeNode[], path: string): TreeNode[] {
  const kept: TreeNode[] = [];
  for (const n of nodes) {
    if (n.path === path) continue;
    if (!n.children) {
      kept.push(n);
      continue;
    }
    kept.push({ ...n, children: removeTreeNode(n.children, path) });
  }
  return kept;
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

function syncMessage(action: SyncAction): string {
  if (action === "pull") return "Pulled tests from Testomat.io";
  return "Pushed tests to Testomat.io";
}

function suiteLabel(node: TreeNode): string {
  const base = node.path.split("/").pop();
  return base || node.name;
}

interface SyncOptions {
  /** Restrict the sync to these files (cwd-relative). */
  files?: string[];
  /** Pull only these suites (`@S…`). */
  suiteIds?: string[];
  /** Override the success toast. */
  label?: string;
}
