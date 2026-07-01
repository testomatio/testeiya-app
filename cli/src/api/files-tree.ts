import fs from "node:fs";
import path from "node:path";
import { getSession } from "../session-store.js";
import { describeWorkspace, VENDOR_DIRS } from "../workspace-model.js";
import { computeChangedFiles, ensureSyncBaseline, type FileStatus } from "../sync-snapshot.js";
import { suiteId } from "../workspace/test-md.js";

const MAX_DEPTH = 8;
const MAX_NODES = 5000;
const TEST_MD_RE = /\.test\.md$/i;

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
  // Where manual tests live, as an absolute path (cwd itself for a root project,
  // null when nothing is loaded). The tree shows ALL files inside it and only
  // `*.test.md` outside it.
  let manualAbs: string | null = null;
  if (info.manualTestsDir !== null) manualAbs = path.resolve(cwd, info.manualTestsDir);

  ensureSyncBaseline(cwd);
  const changed = computeChangedFiles(cwd);
  const nodes = readDir(cwd, "", 0, { count: 0 }, manualAbs, changed);
  return Response.json({ cwd, nodes, changedCount: Object.keys(changed).length, ...info });
}

function readDir(
  absDir: string,
  relDir: string,
  depth: number,
  state: { count: number },
  manualAbs: string | null,
  changed: Record<string, FileStatus>
): TreeNode[] {
  if (depth > MAX_DEPTH || state.count >= MAX_NODES) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const inDotPath = relDir.startsWith(".");
  const folders: TreeNode[] = [];
  const files: TreeNode[] = [];
  for (const entry of entries) {
    if (state.count >= MAX_NODES) break;
    if (VENDOR_DIRS.has(entry.name)) continue;
    const childAbs = path.join(absDir, entry.name);
    const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
    const leadsToManual = !!manualAbs && isAncestorOrEqual(childAbs, manualAbs);

    if (entry.isDirectory()) {
      // Hide dot folders unless they lead to the manual-tests dir (e.g.
      // surface `.testeiya/manual-tests`). Inside such a dot path, keep only the
      // branch heading to the manual dir so `mcp.json`-style siblings stay out.
      if (entry.name.startsWith(".") && !leadsToManual) continue;
      if (inDotPath && !leadsToManual && !isInsideManual(childAbs, manualAbs)) continue;
      state.count++;
      const children = readDir(childAbs, childRel, depth + 1, state, manualAbs, changed);
      folders.push({ name: entry.name, kind: "folder", path: childRel, children });
      continue;
    }
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    // All files inside the manual-tests dir; only `*.test.md` elsewhere.
    if (!isInsideManual(childAbs, manualAbs) && !TEST_MD_RE.test(entry.name)) continue;
    state.count++;
    const file: TreeNode = { name: entry.name, kind: "file", path: childRel };
    if (changed[childRel]) file.status = changed[childRel];
    // Expand `*.test.md` into its tests (one per `<!-- test` marker) so the
    // sidebar tree can drill into each test and scroll to it in the editor. The
    // suite id (when present) lets the UI pull/push this one suite.
    if (TEST_MD_RE.test(entry.name)) {
      const suite = readSuite(childAbs);
      if (suite.id) file.suiteId = suite.id;
      const tests: TreeNode[] = [];
      for (const title of suite.titles) {
        if (state.count >= MAX_NODES) break;
        state.count++;
        tests.push({ name: title, kind: "test", path: childRel, anchor: title, suiteId: suite.id ?? undefined });
      }
      if (tests.length > 0) file.children = tests;
    }
    files.push(file);
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...folders, ...files];
}

/** True when `ancestor` is `target` or a parent directory of it. */
function isAncestorOrEqual(ancestor: string, target: string): boolean {
  if (ancestor === target) return true;
  return target.startsWith(ancestor + path.sep);
}

/** True when `p` is the manual-tests dir or a path within it. */
function isInsideManual(p: string, manualAbs: string | null): boolean {
  if (!manualAbs) return false;
  return isAncestorOrEqual(manualAbs, p);
}

/** The suite id (`@S…`) and each test title of a `*.test.md` in a single read. */
function readSuite(absFile: string): { id: string | null; titles: string[] } {
  let content: string;
  try {
    content = fs.readFileSync(absFile, "utf8");
  } catch {
    return { id: null, titles: [] };
  }
  const id = suiteId(content);
  const titles: string[] = [];
  let armed = false;
  for (const line of content.split("\n")) {
    if (/^<!--\s*test\b/.test(line)) {
      armed = true;
      continue;
    }
    if (!armed) continue;
    const match = /^#{1,2}\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    titles.push(match[1]);
    armed = false;
  }
  return { id: id ? `@S${id}` : null, titles };
}

interface TreeNode {
  name: string;
  kind: "folder" | "file" | "test";
  path: string; // relative to session.cwd
  anchor?: string;
  suiteId?: string; // `@S…` when the file/test belongs to a pushed suite
  status?: FileStatus; // "created" | "changed" since the last Testomat.io sync
  children?: TreeNode[];
}
