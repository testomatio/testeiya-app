import path from "node:path";
import fs from "node:fs";

/**
 * Resolve a user-supplied relative path against the session's `cwd` and
 * verify it doesn't escape the workspace. Returns the absolute path on
 * success, `null` if the path is outside the workspace.
 *
 * Containment is checked both lexically (cheap, rejects `..` and the
 * `/work` vs `/work-evil` prefix false positive) and via `realpath` (a symlink
 * inside the workspace must not point out). On success the *lexical* path is
 * returned — only the containment decision uses realpath — so callers read and
 * write the path the user named and the no-symlink case is unchanged.
 */
export function safeResolve(cwd: string, relPath: string): string | null {
  const normalizedCwd = path.resolve(cwd);
  const abs = path.resolve(normalizedCwd, relPath || ".");

  if (abs !== normalizedCwd && !abs.startsWith(normalizedCwd + path.sep)) {
    return null;
  }

  let realCwd: string;
  try {
    realCwd = fs.realpathSync(normalizedCwd);
  } catch {
    return null;
  }
  const realTarget = realpathExistingPrefix(abs);
  if (realTarget !== realCwd && !realTarget.startsWith(realCwd + path.sep)) {
    return null;
  }
  return abs;
}

// Realpath the deepest existing ancestor of `p`, so a not-yet-created write
// target resolves through any symlinked parent dirs without requiring the leaf
// to exist.
function realpathExistingPrefix(p: string): string {
  let current = p;
  for (;;) {
    try {
      return fs.realpathSync(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}
