import { TESTEIYA_DIR_NAME } from "./vocab.js";

/**
 * System-prompt section describing the workspace context; "" when there is
 * none. `off` is what the user switched off: still on disk, out of bounds, and
 * named here so the agent knows to leave it alone rather than wander in.
 */
export function contextPromptSection(
  entries: ContextEntry[],
  folders: ContextFolder[] = [],
  off: OffContext = {}
): string {
  const body: string[] = [];
  if (entries.length > 0 || folders.length > 0) {
    body.push(
      "This workspace has context attached — the user (or you, earlier) put it there for a purpose. Consult it before answering, and prefer it over assumptions about the project.",
      contextLines(entries, folders),
      `Everything whose path starts with \`${TESTEIYA_DIR_NAME}/\` is in a hidden dir: file-search tools skip hidden dirs by default, so search those explicitly (pass hidden:true, or prefix the path with \`${TESTEIYA_DIR_NAME}/\`). Any other path above is an ordinary workspace path the user attached — read it where it is. Linked folders and cloned repositories are reference material: read them, never modify them. A linked folder is a symlink — wildcard searches do not descend into it; search it with its own path prefix (e.g. \`${TESTEIYA_DIR_NAME}/<name>/\`). Documents under \`${TESTEIYA_DIR_NAME}/requirements\` and \`${TESTEIYA_DIR_NAME}/docs\` are specs and plans — use them when writing or reviewing tests.`
    );
  }
  body.push(...ignoreBlock(off));
  if (body.length === 0) return "";
  return `<workspace-context>\n${indent(body.join("\n\n"))}\n</workspace-context>`;
}

/** Per-prompt notice when the context changed mid-session; appended to the next prompt. */
export function contextUpdateNotice(
  entries: ContextEntry[],
  folders: ContextFolder[] = [],
  off: OffContext = {}
): string {
  const body: string[] = [];
  if (entries.length > 0 || folders.length > 0) {
    body.push(
      "The workspace context just changed. It now contains:",
      contextLines(entries, folders),
      `This was done for a purpose — take it into account for this and future requests. Remember \`${TESTEIYA_DIR_NAME}/\` is hidden: search it with hidden:true or an explicit path prefix.`
    );
  }
  body.push(...ignoreBlock(off));
  if (body.length === 0) {
    body.push("Nothing is attached to this workspace any more. Do not rely on earlier context.");
  }
  return `<workspace-context-update>\n${indent(body.join("\n\n"))}\n</workspace-context-update>`;
}

/**
 * The paths the user switched off. Nothing was deleted, so the agent would
 * otherwise walk straight back into them. Naming them as out of bounds is what
 * makes the switch mean anything to the agent.
 */
function ignoreBlock(off: OffContext): string[] {
  const paths: string[] = [];
  for (const f of off.folders ?? []) paths.push(`\`${f.path}/\``);
  for (const e of off.entries ?? []) paths.push(offName(e));
  if (paths.length === 0) return [];
  const block = [
    `Switched off by the user: ${paths.join(", ")}.`,
    "Ignore them while they are off: do not read, search, list or write into them, and do not count what they hold — not even where another rule points at them by name. They are still on disk, switched off on purpose. If a task cannot be done without them, say so instead of using them.",
  ];
  if (off.entries?.some((e) => e.kind === "test")) {
    block.push("A switched-off test is that one test: the rest of its suite file is not switched off.");
  }
  return block;
}

/** A switched-off test is named as that test, never as its whole file. */
function offName(e: ContextEntry): string {
  if (e.kind === "test") return `the test "${e.anchor}" in \`${e.path}\``;
  return `\`${e.path}\``;
}

/** Two spaces on every non-empty line, so a body sits inside its tag. */
function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line) return line;
      return `  ${line}`;
    })
    .join("\n");
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
  if (e.kind === "test") {
    return `\`${e.path}\` — only the ${e.testType ?? "manual"} test "${e.anchor}" in this suite file, attached by the user (${date})`;
  }
  // A path outside the hidden dir is one the user attached where it already
  // lives — it is part of the project, not reference material dropped beside it.
  if (!e.path.startsWith(`${TESTEIYA_DIR_NAME}/`)) {
    let what = "folder";
    if (e.kind === "file") what = "file";
    return `\`${e.path}\` — workspace ${what}, attached by the user (${date})`;
  }
  let from = "";
  if (e.origin && e.origin !== e.name) from = ` from ${e.origin}`;
  if (e.kind === "repo") return `\`${e.path}\` — git repository${from} (${date})`;
  if (e.kind === "folder") return `\`${e.path}\` — local folder${from} (${date})`;
  return `\`${e.path}\` — document${from} (${date})`;
}

export type ContextKind = "folder" | "repo" | "file" | "test";

/** What the user switched off: on disk, out of bounds until switched back on. */
export interface OffContext {
  folders?: ContextFolder[];
  entries?: ContextEntry[];
}

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
  /** A `test` entry's heading in its `*.test.md` file. */
  anchor?: string;
  testType?: "manual" | "automated";
}
