import { existsSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The per-project config directory name Testeiya uses inside a workspace.
 *
 * The pi-coding-agent SDK defaults this to `.omp`, but `session-factory.ts`
 * monkey-patches `SOURCE_PATHS.native.projectDir` to this value so MCP / skills
 * / rules discovery reads from `<cwd>/.testeiya/*`. Everything that *writes*
 * MCP config (agent-start, the MCP settings API) must use the SAME directory or
 * the agent won't see it. This constant is the single source of truth.
 */
export const PROJECT_DIR = ".testeiya";

/** Legacy directory used before the project dir was unified on `.testeiya`. */
export const LEGACY_PROJECT_DIR = ".omp";

/** Testeiya's global state directory in the user's home (`~/.testeiya`). */
export const HOME_DIR = join(homedir(), PROJECT_DIR);

/** Root of the managed per-project workspaces (`~/.testeiya/workspaces`). */
export const WORKSPACES_DIR = join(HOME_DIR, "workspaces");

/**
 * Where Testeiya caches pulled manual tests when overlaying them onto a folder
 * that is *not* a manual-tests-only workspace (a user's code repo). Lives under
 * the project dir so it is gitignored and never pollutes the tracked tree.
 */
export const MANUAL_TESTS_SUBDIR = "manual-tests";

/** Records which Testomat.io project a workspace represents (id + base URL). */
export const PROJECT_META_FILE = "testeiya.json";

/** Hashes of the manual-test files as of the last Testomat.io sync (pull/push). */
export const SYNC_SNAPSHOT_FILE = "sync-snapshot.json";

/** Absolute path to the gitignored manual-tests cache inside `cwd`. */
export function manualTestsCachePath(cwd: string): string {
  return join(cwd, PROJECT_DIR, MANUAL_TESTS_SUBDIR);
}

/** Absolute path to the project-association metadata file inside `cwd`. */
export function projectMetaPath(cwd: string): string {
  return join(cwd, PROJECT_DIR, PROJECT_META_FILE);
}

/** Absolute path to the last-sync snapshot file inside `cwd`. */
export function syncSnapshotPath(cwd: string): string {
  return join(cwd, PROJECT_DIR, SYNC_SNAPSHOT_FILE);
}

/** The home state dir used before the rename from "testclaw" to "testeiya". */
const LEGACY_HOME_DIR = join(homedir(), ".testclaw");

/**
 * One-shot migration for the rename from "testclaw" to "testeiya": if the old
 * `~/.testclaw` state dir exists and the new `~/.testeiya` does not, move it so
 * existing sessions, auth tokens, provider keys, and pulled workspaces survive.
 * Idempotent — a no-op once `~/.testeiya` exists; any failure is non-fatal.
 */
export function migrateLegacyHomeDir(): void {
  if (existsSync(HOME_DIR)) return;
  if (!existsSync(LEGACY_HOME_DIR)) return;
  try {
    renameSync(LEGACY_HOME_DIR, HOME_DIR);
  } catch {
    // ignore — a fresh ~/.testeiya is created on demand if the move fails
  }
}
