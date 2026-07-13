// Which workspace files are safely recoverable from git — used so the UI can
// delete a committed file without a confirmation prompt (it can be restored).

import { spawnSync } from "node:child_process";

/**
 * Set of `cwd`-relative paths that git tracks AND that are unmodified in the
 * working tree, so their current content is recoverable via `git restore`.
 * Paths match `git ls-files` (always cwd-relative, so they line up with the
 * file-tree's relative paths). Empty when `cwd` isn't a git work tree (a managed
 * `~/.testeiya/workspaces` dir) or git is unavailable, so callers fall back to
 * "not committed" and keep prompting.
 */
export function gitCommittedFiles(cwd: string): Set<string> {
  const tracked = gitList(cwd, ["ls-files", "-z"]);
  if (!tracked) return new Set();
  const modified = new Set(gitList(cwd, ["ls-files", "-m", "-z"]) ?? []);
  return new Set(tracked.filter((rel) => !modified.has(rel)));
}

// The checked-out branch of `cwd`'s git work tree, for the workspace status bar.
// null when `cwd` isn't a git repo, git is unavailable, or HEAD is detached
// (`--show-current` prints nothing) — the status bar then shows just the path.
export function gitBranch(cwd: string): string | null {
  const res = spawnSync("git", ["branch", "--show-current"], {
    cwd,
    encoding: "utf8",
  });
  if (res.status !== 0 || typeof res.stdout !== "string") return null;
  return res.stdout.trim() || null;
}

function gitList(cwd: string, args: string[]): string[] | null {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0 || typeof res.stdout !== "string") return null;
  return res.stdout.split("\0").filter(Boolean);
}
