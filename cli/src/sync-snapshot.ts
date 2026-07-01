// Tracks which manual-test files changed since the last Testomat.io sync.
//
// After every successful `check-tests` pull/push the synced files are
// content-hashed into `.testeiya/sync-snapshot.json` (the baseline = the state
// the remote agrees with). The file tree then diffs the current files against
// that baseline so a created/edited-but-not-pushed file can be flagged.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./json-store.js";
import { resolveManualTestsDir, VENDOR_DIRS } from "./workspace-model.js";
import { syncSnapshotPath } from "./project-dir.js";

const TEST_MD_RE = /\.test\.md$/i;
const MAX_FILES = 5000;

/**
 * Snapshot the manual-test files `check-tests` just synced. `syncedDir` is the
 * dir it ran in, relative to `cwd` (`"."` for a root project). Only that subtree
 * is re-hashed, so multi-project workspaces (one snapshot, many synced subdirs)
 * keep each other's entries.
 *
 * `onlyFiles` (cwd-relative paths) scopes a *partial* sync: a push/pull of a
 * single suite or just the changed files re-baselines only those files, so the
 * other un-pushed files keep their "changed" markers.
 */
export function writeSyncSnapshot(cwd: string, syncedDir: string, onlyFiles?: string[]): void {
  const snapshot = readJson<SyncSnapshot>(syncSnapshotPath(cwd), emptySnapshot());
  if (onlyFiles) {
    for (const rel of onlyFiles) {
      const hash = hashFile(path.resolve(cwd, rel));
      if (hash) snapshot.files[rel] = hash;
      else delete snapshot.files[rel];
    }
    snapshot.syncedAt = new Date().toISOString();
    writeJson(syncSnapshotPath(cwd), snapshot);
    return;
  }
  const base = syncedDir === "." ? "" : syncedDir;
  for (const key of Object.keys(snapshot.files)) {
    if (isUnder(key, base)) delete snapshot.files[key];
  }
  hashDir(path.resolve(cwd, base), base, snapshot.files, { count: 0 });
  snapshot.syncedAt = new Date().toISOString();
  writeJson(syncSnapshotPath(cwd), snapshot);
}

/**
 * Establish a baseline if the workspace has manual tests but never recorded one
 * (e.g. a folder opened without a sync, or pulled before tracking existed). The
 * current state becomes "the last synced state", so edits from now on are
 * detected without forcing the user to push first.
 */
export function ensureSyncBaseline(cwd: string): void {
  const manualDir = resolveManualTestsDir(cwd);
  if (manualDir === null) return;
  if (fs.existsSync(syncSnapshotPath(cwd))) return;
  writeSyncSnapshot(cwd, manualDir === "" ? "." : manualDir);
}

/**
 * Map of `cwd`-relative path → status for manual-test files that differ from the
 * last sync. Empty when nothing is loaded or no snapshot exists yet (so a
 * freshly pulled workspace shows clean rather than lighting up entirely).
 */
export function computeChangedFiles(cwd: string): Record<string, FileStatus> {
  const manualDir = resolveManualTestsDir(cwd);
  if (manualDir === null) return {};
  const snapshot = readJson<SyncSnapshot | null>(syncSnapshotPath(cwd), null);
  if (!snapshot) return {};

  const current: Record<string, string> = {};
  hashDir(path.resolve(cwd, manualDir), manualDir, current, { count: 0 });

  const changed: Record<string, FileStatus> = {};
  for (const rel of Object.keys(current)) {
    const before = snapshot.files[rel];
    if (!before) {
      changed[rel] = "created";
      continue;
    }
    if (before !== current[rel]) changed[rel] = "changed";
  }
  return changed;
}

function hashDir(
  absDir: string,
  relDir: string,
  out: Record<string, string>,
  state: { count: number }
): void {
  if (state.count >= MAX_FILES) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (state.count >= MAX_FILES) return;
    if (entry.name.startsWith(".") || VENDOR_DIRS.has(entry.name)) continue;
    const childAbs = path.join(absDir, entry.name);
    const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      hashDir(childAbs, childRel, out, state);
      continue;
    }
    if (!entry.isFile() || !TEST_MD_RE.test(entry.name)) continue;
    const hash = hashFile(childAbs);
    if (!hash) continue;
    out[childRel] = hash;
    state.count++;
  }
}

function hashFile(absFile: string): string | null {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(absFile)).digest("hex");
  } catch {
    return null;
  }
}

function isUnder(key: string, base: string): boolean {
  if (base === "") return true;
  return key === base || key.startsWith(`${base}/`);
}

function emptySnapshot(): SyncSnapshot {
  return { syncedAt: "", files: {} };
}

export type FileStatus = "created" | "changed";

interface SyncSnapshot {
  syncedAt: string;
  files: Record<string, string>;
}
