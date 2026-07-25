import fs from "node:fs";
import path from "node:path";
import dedent from "dedent";
import {
  PROJECT_DIR,
  CONTEXT_CODE_SUBDIR,
  CONTEXT_REQUIREMENTS_SUBDIR,
  MANUAL_TESTS_SUBDIR,
  contextManifestPath,
  ensureProjectDirGuards,
} from "./project-dir.js";

/**
 * Workspace context: extra resources attached to a workspace so the agent can
 * consult them — symlinked local folders and shallow-cloned git repos (both
 * directly under `.testeiya/<name>`, named after the source) and documents
 * (under `.testeiya/requirements/` and `.testeiya/docs/`). The manifest
 * (`.testeiya/context.json`) records what the user added via the UI;
 * `listContext` folds in anything else found in the legacy `.testeiya/code/`
 * dir (e.g. put there by the agent itself), so the system prompt and the chat
 * status bar always reflect the real folder contents.
 */

/** Extra doc dir the agent writes on its own (see the system prompt's context structure). */
const CONTEXT_DOCS_SUBDIR = "docs";

/**
 * The predefined `.testeiya` context structure — mirrors the system prompt's
 * <context-workspace> section. Only these are surfaced as status-bar sections;
 * anything else inside `.testeiya` (uploads, skills, ad-hoc agent dirs) is
 * plumbing, not context. User-added entries (linked folders, cloned repos)
 * live directly under `.testeiya/<name>` and must never shadow these names.
 */
export const CONTEXT_SECTION_DIRS = [
  MANUAL_TESTS_SUBDIR,
  CONTEXT_CODE_SUBDIR,
  CONTEXT_REQUIREMENTS_SUBDIR,
  CONTEXT_DOCS_SUBDIR,
  "auto-tests",
  "exploratory",
];

/** The non-empty predefined context folders, one status-bar section each. */
export function listContextFolders(cwd: string): ContextFolder[] {
  const folders: ContextFolder[] = [];
  for (const name of CONTEXT_SECTION_DIRS) {
    const count = readdirSafe(path.join(cwd, PROJECT_DIR, name)).filter(
      (e) => !e.name.startsWith(".")
    ).length;
    if (count === 0) continue;
    folders.push({ name, path: `${PROJECT_DIR}/${name}`, count });
  }
  return folders;
}

/** Every context entry: the manifest plus items discovered on disk. */
export function listContext(cwd: string): ContextEntry[] {
  const manifest = loadContextEntries(cwd);
  const known = new Set(manifest.map((e) => e.path));
  const discovered: ContextEntry[] = [];
  discoverDirs(cwd, CONTEXT_CODE_SUBDIR, known, discovered);
  discoverFiles(cwd, CONTEXT_REQUIREMENTS_SUBDIR, known, discovered);
  discoverFiles(cwd, CONTEXT_DOCS_SUBDIR, known, discovered);
  return [...manifest, ...discovered];
}

export function loadContextEntries(cwd: string): ContextEntry[] {
  let raw: { entries?: ContextEntry[] };
  try {
    raw = JSON.parse(fs.readFileSync(contextManifestPath(cwd), "utf8"));
  } catch {
    return [];
  }
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  return entries.filter((e) => e?.path && exists(path.join(cwd, e.path)));
}

export function saveContextEntries(cwd: string, entries: ContextEntry[]): void {
  const dir = path.join(cwd, PROJECT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  ensureProjectDirGuards(cwd);
  fs.writeFileSync(
    contextManifestPath(cwd),
    JSON.stringify({ entries, updatedAt: new Date().toISOString() }, null, 2)
  );
}

/**
 * Change marker for the workspace context: the manifest mtime plus the set of
 * non-empty predefined folders (so a mid-session pull that seeds
 * `manual-tests` also registers as a change). "" when nothing exists.
 */
export function contextStamp(cwd: string): string {
  let mtime = 0;
  try {
    mtime = fs.statSync(contextManifestPath(cwd)).mtimeMs;
  } catch {
    // no manifest yet
  }
  const names = listContextFolders(cwd).map((f) => f.name);
  return `${mtime}|${names.join(",")}`;
}

/** System-prompt section describing the workspace context; "" when none. */
export function contextPromptSection(
  entries: ContextEntry[],
  folders: ContextFolder[] = []
): string {
  if (entries.length === 0 && folders.length === 0) return "";
  return dedent`
  <workspace-context>
    This workspace has context attached — the user (or you, earlier) put it there for a purpose. Consult it before answering, and prefer it over assumptions about the project.

  ${contextLines(entries, folders)}

    ALL of it lives under the hidden \`${PROJECT_DIR}/\` dir: file-search tools skip hidden dirs by default, so search it explicitly (pass hidden:true, or prefix the path with \`${PROJECT_DIR}/\`). Linked folders and cloned repositories are reference material: read them, never modify them. A linked folder is a symlink — wildcard searches do not descend into it; search it with its own path prefix (e.g. \`${PROJECT_DIR}/<name>/\`). Documents under \`${PROJECT_DIR}/requirements\` and \`${PROJECT_DIR}/docs\` are specs and plans — use them when writing or reviewing tests.
  </workspace-context>
  `;
}

/** Per-prompt notice when the context changed mid-session; appended to the next prompt. */
export function contextUpdateNotice(
  entries: ContextEntry[],
  folders: ContextFolder[] = []
): string {
  if (entries.length === 0 && folders.length === 0) {
    return dedent`
    <workspace-context-update>
      All extra workspace context was removed. Do not rely on it anymore.
    </workspace-context-update>
    `;
  }
  return dedent`
  <workspace-context-update>
    The workspace context just changed. It now contains:

  ${contextLines(entries, folders)}

    This was done for a purpose — take it into account for this and future requests. Remember \`${PROJECT_DIR}/\` is hidden: search it with hidden:true or an explicit path prefix.
  </workspace-context-update>
  `;
}

function contextLines(entries: ContextEntry[], folders: ContextFolder[]): string {
  const lines: string[] = [];
  const covered = new Set(entries.map((e) => parentDir(e.path)));
  for (const f of folders) {
    if (covered.has(f.path)) continue;
    lines.push(`- \`${f.path}/\` — ${folderPurpose(f.name)}`);
  }
  for (const e of entries) lines.push(`- ${describeEntry(e)}`);
  return lines.join("\n");
}

function folderPurpose(name: string): string {
  if (name === "manual-tests") {
    return "the project's manual test suites pulled from Testomat.io (*.test.md — THE manual tests of this project)";
  }
  if (name === "code") return "reference code added as context";
  if (name === "requirements") return "requirements and specs";
  if (name === "docs") return "test planning and strategy documents";
  if (name === "auto-tests") return "automated test references";
  return "exploratory testing setup";
}

function parentDir(rel: string): string {
  const idx = rel.lastIndexOf("/");
  if (idx < 0) return "";
  return rel.slice(0, idx);
}

function describeEntry(e: ContextEntry): string {
  const date = e.addedAt?.split("T")[0] ?? "";
  let from = "";
  if (e.origin && e.origin !== e.name) from = ` from ${e.origin}`;
  if (e.kind === "repo") return `\`${e.path}\` — git repository${from} (${date})`;
  if (e.kind === "folder") return `\`${e.path}\` — local folder${from} (${date})`;
  return `\`${e.path}\` — document${from} (${date})`;
}

// Top-level dirs in `.testeiya/code` not in the manifest: `folder` entries, or
// `repo` when they carry their own `.git` (a clone made by the agent).
function discoverDirs(
  cwd: string,
  subdir: string,
  known: Set<string>,
  out: ContextEntry[]
): void {
  for (const entry of readdirSafe(path.join(cwd, PROJECT_DIR, subdir))) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const rel = `${PROJECT_DIR}/${subdir}/${entry.name}`;
    if (known.has(rel)) continue;
    let kind: ContextKind = "folder";
    if (!entry.isSymbolicLink() && fs.existsSync(path.join(cwd, rel, ".git"))) kind = "repo";
    out.push(discoveredEntry(cwd, kind, entry.name, rel));
  }
}

function discoverFiles(
  cwd: string,
  subdir: string,
  known: Set<string>,
  out: ContextEntry[]
): void {
  for (const entry of readdirSafe(path.join(cwd, PROJECT_DIR, subdir))) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    const rel = `${PROJECT_DIR}/${subdir}/${entry.name}`;
    if (known.has(rel)) continue;
    out.push(discoveredEntry(cwd, "file", entry.name, rel));
  }
}

function discoveredEntry(
  cwd: string,
  kind: ContextKind,
  name: string,
  rel: string
): ContextEntry {
  let addedAt = "";
  try {
    addedAt = fs.lstatSync(path.join(cwd, rel)).mtime.toISOString();
  } catch {
    // keep empty — the entry is still listable
  }
  return { id: `fs:${rel}`, kind, name, path: rel, origin: "", addedAt };
}

function readdirSafe(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function exists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

export type ContextKind = "folder" | "repo" | "file";

/** A top-level `.testeiya` folder shown as a status-bar section. */
export interface ContextFolder {
  name: string;
  /** Relative to cwd (`.testeiya/<name>`). */
  path: string;
  /** Direct children (files + dirs, dot entries excluded). */
  count: number;
}

export interface ContextEntry {
  id: string;
  kind: ContextKind;
  name: string;
  /** Location inside the workspace, relative to cwd (always under `.testeiya/`). */
  path: string;
  /** Where it came from: an absolute local path, a git URL, or the uploaded filename. */
  origin: string;
  addedAt: string;
}
