// The Workspace ↔ Project model.
//
// A *workspace* is a directory on disk; a *project* is a Testomat.io project a
// workspace represents. This module classifies a workspace and locates its
// manual tests so the file tree, the sync endpoint, and the initial pull all
// agree on one rule:
//
//   - `.testeiya/manual-tests/` (gitignored cache) wins when present & non-empty
//     — a user's code repo with tests overlaid into it;
//   - otherwise the workspace ROOT, when ≥90% of its files are `*.test.md`
//     — a manual-tests-only folder (incl. Testeiya's per-project workspaces);
//   - otherwise `null` — nothing loaded yet (a pull would create the cache).

import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./json-store.js";
import {
  PROJECT_DIR,
  MANUAL_TESTS_SUBDIR,
  manualTestsCachePath,
  projectMetaPath,
} from "./project-dir.js";

/** Directories never counted in detection nor shown in the tree. */
export const VENDOR_DIRS = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "out",
  "tmp",
  ".git",
  ".next",
]);

const TEST_MD_RE = /\.test\.md$/i;
const PROJECT_THRESHOLD = 0.9;
const MAX_SCAN_NODES = 5000;

/** True when ≥90% of the folder's files (excluding vendor dirs) are `*.test.md`. */
export function detectManualProject(cwd: string): boolean {
  const acc = { total: 0, test: 0, nodes: 0 };
  countFiles(cwd, acc);
  if (acc.total === 0) return false;
  return acc.test / acc.total >= PROJECT_THRESHOLD;
}

/**
 * Locate the manual-tests source dir relative to `cwd`:
 *   `".testeiya/manual-tests"` | `""` (root) | `null` (none loaded yet).
 */
export function resolveManualTestsDir(cwd: string): string | null {
  if (hasMarkdown(manualTestsCachePath(cwd))) {
    return `${PROJECT_DIR}/${MANUAL_TESTS_SUBDIR}`;
  }
  if (detectManualProject(cwd)) return "";
  return null;
}

export function readProjectMeta(cwd: string): ProjectMeta | null {
  const raw = readJson<Partial<ProjectMeta>>(projectMetaPath(cwd), {});
  if (!raw?.projectId || !raw.baseUrl) return null;
  return { projectId: raw.projectId, baseUrl: raw.baseUrl, title: raw.title };
}

export function writeProjectMeta(cwd: string, meta: ProjectMeta): void {
  writeJson(projectMetaPath(cwd), meta);
  // Keep the cache out of the user's repo history.
  fs.writeFileSync(path.join(cwd, PROJECT_DIR, ".gitignore"), "*\n", "utf8");
}

/** Combined view for the file-tree response. */
export function describeWorkspace(cwd: string): WorkspaceInfo {
  const manualTestsDir = resolveManualTestsDir(cwd);
  return {
    manualTestsDir,
    isProject: manualTestsDir === "",
    project: readProjectMeta(cwd),
  };
}

function countFiles(
  dir: string,
  acc: { total: number; test: number; nodes: number }
): void {
  if (acc.nodes >= MAX_SCAN_NODES) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (acc.nodes >= MAX_SCAN_NODES) return;
    if (entry.name.startsWith(".")) continue;
    if (VENDOR_DIRS.has(entry.name)) continue;
    acc.nodes++;
    if (entry.isDirectory()) {
      countFiles(path.join(dir, entry.name), acc);
      continue;
    }
    if (!entry.isFile()) continue;
    acc.total++;
    if (TEST_MD_RE.test(entry.name)) acc.test++;
  }
}

function hasMarkdown(dir: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) return true;
    if (entry.isDirectory() && hasMarkdown(path.join(dir, entry.name))) return true;
  }
  return false;
}

export interface ProjectMeta {
  projectId: string;
  baseUrl: string;
  title?: string;
}

export interface WorkspaceInfo {
  manualTestsDir: string | null;
  isProject: boolean;
  project: ProjectMeta | null;
}
