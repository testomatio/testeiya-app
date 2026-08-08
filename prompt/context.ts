import dedent from "dedent";
import { TESTEIYA_DIR_NAME } from "./vocab.js";

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

    ALL of it lives under the hidden \`${TESTEIYA_DIR_NAME}/\` dir: file-search tools skip hidden dirs by default, so search it explicitly (pass hidden:true, or prefix the path with \`${TESTEIYA_DIR_NAME}/\`). Linked folders and cloned repositories are reference material: read them, never modify them. A linked folder is a symlink — wildcard searches do not descend into it; search it with its own path prefix (e.g. \`${TESTEIYA_DIR_NAME}/<name>/\`). Documents under \`${TESTEIYA_DIR_NAME}/requirements\` and \`${TESTEIYA_DIR_NAME}/docs\` are specs and plans — use them when writing or reviewing tests.
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

    This was done for a purpose — take it into account for this and future requests. Remember \`${TESTEIYA_DIR_NAME}/\` is hidden: search it with hidden:true or an explicit path prefix.
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
