import fs from "node:fs";
import path from "node:path";
import { getSession } from "../session-store.js";
import {
  describeWorkspace,
  VENDOR_DIRS,
  TEST_MD_RE,
  isAutomatedTestFile,
  isTestConfigFile,
  type WorkspaceInfo,
  type WorkspaceType,
  type WorkspaceTypeEntry,
} from "../workspace-model.js";
import { computeChangedFiles, ensureSyncBaseline, type FileStatus } from "../sync-snapshot.js";
import { loadGitignore, type GitignoreChain } from "../gitignore.js";
import { PROJECT_DIR, LEGACY_PROJECT_DIR } from "../project-dir.js";
import { gitCommittedFiles, gitChangedFiles, gitBranch } from "../git-tracked.js";
import { suiteId, suiteEmoji } from "../workspace/test-md.js";

const MAX_DEPTH = 8;
// Budget for *filesystem* entries (dirs + files). Test nodes parsed from inside
// a suite file are free — the file is already read for its suite id, and they
// must not starve sibling folders out of the tree (a 2800-test project would
// otherwise truncate the repo's own dirs).
const MAX_NODES = 10000;

export async function filesTree(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    return Response.json({ error: "session required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  const cwd = path.resolve(session.cwd);
  if (!fs.existsSync(cwd)) {
    return Response.json({ error: "Workspace missing" }, { status: 410 });
  }

  const info = describeWorkspace(cwd);
  const active = pickType(info, url.searchParams.get("type"));
  // The dir the active view focuses on, absolute. Everything inside it is shown;
  // manual manual-tests dir is null when nothing is loaded (then only `*.test.md`).
  let focusAbs: string | null = null;
  if (active.type === "manual" && info.manualTestsDir !== null) {
    focusAbs = path.resolve(cwd, info.manualTestsDir);
  } else if (active.dir) {
    focusAbs = path.resolve(cwd, active.dir);
  }
  // Only the Files view folds in the whole gitignored `.testeiya` dir so "show
  // all" really shows everything — the pulled manual tests, user-added context
  // (code/, requirements/, …) and the config files. The Code view stays the
  // source repo; the Manual view stays tests-only.
  let configAbs: string | null = null;
  if (active.type === "files" && !active.dir) {
    configAbs = path.resolve(cwd, PROJECT_DIR);
  }
  const view: TreeView = {
    type: active.type,
    focusAbs,
    configAbs,
    branchOnly: !!active.dir && active.type !== "manual",
  };

  ensureSyncBaseline(cwd);
  // Manual tests flag files un-synced since the last Testomat.io pull/push; code
  // files flag what changed since the last git commit. The manual view keeps the
  // sync baseline only; other views add git status, with sync markers (the folded
  // manual-tests) winning where both apply.
  const syncChanged = computeChangedFiles(cwd);
  const gitChanged = view.type === "manual" ? {} : gitChangedFiles(cwd);
  const changed = { ...gitChanged, ...syncChanged };
  const committed = gitCommittedFiles(cwd);
  const state = { count: 0 };
  const nodes = readDir(cwd, "", 0, state, view, changed, committed, loadGitignore(cwd));
  return Response.json({
    cwd,
    branch: gitBranch(cwd),
    nodes,
    truncated: state.count >= MAX_NODES,
    changedCount: Object.keys(changed).length,
    activeType: active.type,
    ...info,
  });
}

function readDir(
  absDir: string,
  relDir: string,
  depth: number,
  state: { count: number },
  view: TreeView,
  changed: Record<string, FileStatus>,
  committed: Set<string>,
  ig: GitignoreChain
): TreeNode[] {
  if (depth > MAX_DEPTH || state.count >= MAX_NODES) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const configTop = relDir.split("/")[0];
  const inConfigDir = configTop === PROJECT_DIR || configTop === LEGACY_PROJECT_DIR;
  const folders: TreeNode[] = [];
  const files: TreeNode[] = [];
  for (const entry of entries) {
    if (state.count >= MAX_NODES) break;
    if (VENDOR_DIRS.has(entry.name)) continue;
    const childAbs = path.join(absDir, entry.name);
    const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
    // Resolve symlinks (linked context folders under `.testeiya/`) so they
    // render as the dir/file they point at; dangling links are dropped.
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const target = fs.statSync(childAbs);
        isDir = target.isDirectory();
        isFile = target.isFile();
      } catch {
        continue;
      }
    }
    // A browse-all view surfaces both the view's focus and the whole `.testeiya`
    // dir, so `leads`/`inside` fold in `configAbs` too.
    const leads =
      (!!view.focusAbs && isAncestorOrEqual(childAbs, view.focusAbs)) ||
      (!!view.configAbs && isAncestorOrEqual(childAbs, view.configAbs));
    const inside = isInsideFocus(childAbs, view.focusAbs) || isInsideFocus(childAbs, view.configAbs);

    // Hide git-ignored paths (e.g. a Rails `storage/` blob cache), except the
    // surfaced `.testeiya` cache the browse-all view deliberately folds in.
    if (!leads && !inside && ig.ignores(childRel)) continue;

    if (isDir) {
      // Hide only the internal config dir (`.testeiya`/`.omp`) unless it leads
      // to a surfaced dir (e.g. `.testeiya/manual-tests`). Other non-git-ignored
      // dot folders (`.github`, `.circleci`, …) are valuable and render normally.
      // Inside the config dir, keep only the branch heading to a surfaced dir so
      // `mcp.json`-style siblings stay out. A subdir view (`branchOnly`) prunes the rest.
      if ((entry.name === PROJECT_DIR || entry.name === LEGACY_PROJECT_DIR) && !leads) continue;
      if (inConfigDir && !leads && !inside) continue;
      if (view.branchOnly && !leads && !inside) continue;
      state.count++;
      const children = readDir(childAbs, childRel, depth + 1, state, view, changed, committed, ig.descend(childRel));
      // Prune folders outside the focus dir whose files were all filtered out,
      // so a manual view over `.testeiya/manual-tests` doesn't render empty
      // `src/`/`tests/` repo folders. Folders inside the focus dir always show.
      if (children.length === 0 && !inside) continue;
      folders.push({ name: entry.name, kind: "folder", path: childRel, children });
      continue;
    }
    if (!isFile || entry.name.startsWith(".")) continue;
    // Inside the config dir (`.testeiya`), only show files that live inside a
    // surfaced dir — keep `mcp.json`/`testeiya.json` siblings out of every view.
    if (inConfigDir && !inside) continue;
    // Files inside a surfaced dir always show. Outside it: nothing in a subdir
    // view, only `*.test.md` in a manual view, automated tests + the framework
    // config in an automated view, everything in a code/files view.
    if (!inside) {
      if (view.branchOnly) continue;
      if (view.type === "manual" && !TEST_MD_RE.test(entry.name)) continue;
      if (
        view.type === "automated" &&
        !isAutomatedTestFile(entry.name) &&
        !isTestConfigFile(entry.name)
      ) {
        continue;
      }
    }
    state.count++;
    const file: TreeNode = { name: entry.name, kind: "file", path: childRel };
    if (changed[childRel]) file.status = changed[childRel];
    if (committed.has(childRel)) file.committed = true;
    // Expand `*.test.md` into its tests (one per `<!-- test` marker) so the
    // sidebar tree can drill into each test and scroll to it in the editor. The
    // suite id (when present) lets the UI pull/push this one suite. A pulled
    // suite mixes manual and automated tests; `testType` distinguishes them.
    if (TEST_MD_RE.test(entry.name)) {
      const suite = readSuite(childAbs);
      if (suite.id) file.suiteId = suite.id;
      if (suite.emoji) file.emoji = suite.emoji;
      const tests: TreeNode[] = [];
      for (const test of suite.tests) {
        tests.push({
          name: test.title,
          kind: "test",
          path: childRel,
          anchor: test.title,
          testType: test.type,
          suiteId: suite.id ?? undefined,
        });
      }
      if (tests.length > 0) file.children = tests;
    }
    files.push(file);
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...folders, ...files];
}

/** Resolve the active view: an explicit `?type=`, else manual, else the first. */
function pickType(info: WorkspaceInfo, param: string | null): WorkspaceTypeEntry {
  const fromParam = info.types.find((t) => t.type === param);
  if (fromParam) return fromParam;
  const manual = info.types.find((t) => t.type === "manual");
  if (manual) return manual;
  return info.types[0];
}

/** True when `ancestor` is `target` or a parent directory of it. */
function isAncestorOrEqual(ancestor: string, target: string): boolean {
  if (ancestor === target) return true;
  return target.startsWith(ancestor + path.sep);
}

/** True when `p` is the focus dir or a path within it. */
function isInsideFocus(p: string, focusAbs: string | null): boolean {
  if (!focusAbs) return false;
  return isAncestorOrEqual(focusAbs, p);
}

/** The suite id (`@S…`) and each test (title + state) of a `*.test.md` in a single read. */
function readSuite(absFile: string): Suite {
  let content: string;
  try {
    content = fs.readFileSync(absFile, "utf8");
  } catch {
    return { id: null, emoji: null, tests: [] };
  }
  const id = suiteId(content);
  const emoji = suiteEmoji(content);
  const tests: SuiteTest[] = [];
  let armed = false;
  let type: TestState = "manual";
  for (const line of content.split("\n")) {
    if (/^<!--\s*test\b/.test(line)) {
      armed = true;
      type = "manual";
      continue;
    }
    if (!armed) continue;
    if (/^type:\s*automated\s*$/.test(line)) {
      type = "automated";
      continue;
    }
    const match = /^#{1,2}\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    tests.push({ title: match[1], type });
    armed = false;
  }
  return { id: id ? `@S${id}` : null, emoji, tests };
}

type TestState = "manual" | "automated";

interface SuiteTest {
  title: string;
  type: TestState;
}

interface Suite {
  id: string | null;
  emoji: string | null;
  tests: SuiteTest[];
}

interface TreeNode {
  name: string;
  kind: "folder" | "file" | "test";
  path: string; // relative to session.cwd
  anchor?: string;
  testType?: TestState; // the `type:` of a test block — drives the Manual/Automated split
  suiteId?: string; // `@S…` when the file/test belongs to a pushed suite
  emoji?: string; // suite icon from the `<!-- suite` block's `emoji:` field
  status?: FileStatus; // "created" | "changed" since the last Testomat.io sync
  committed?: boolean; // tracked by git and unmodified — safely restorable
  children?: TreeNode[];
}

interface TreeView {
  type: WorkspaceType;
  focusAbs: string | null;
  configAbs: string | null;
  branchOnly: boolean;
}
