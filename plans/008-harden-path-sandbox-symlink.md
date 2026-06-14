# Plan 008: Harden the path sandbox against symlink escape (+ tests)

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the `testeiya/` submodule** (`src/workspace/safe-path.ts` +
> a new test). Commit inside the submodule.
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- src/workspace/safe-path.ts src/api/files-read.ts src/api/files-write.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (must not break legitimate reads/writes; symlink handling differs
  for read vs. write of non-existent files)
- **Depends on**: 001 (the `bun test` harness/script)
- **Category**: security / tests
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

`safeResolve` is the **entire** sandbox for the workspace file API (`/api/files/read`
and `/api/files/write`). It does a purely *lexical* check (`path.resolve` +
`startsWith(cwd + sep)`) with no `realpath`. A symlink inside the workspace that
points outside passes the lexical check, so a read returns — or a write
clobbers — a file **outside** the workspace. In desktop mode the workspace `cwd`
is a user-picked folder, so the blast radius is the user's whole disk. The fix:
resolve symlinks (for writes, resolve the existing parent) and re-check
containment against the real workspace path.

## Current state

- `testeiya/src/workspace/safe-path.ts` (full, 14 lines):
  ```ts
  import path from "node:path";

  export function safeResolve(cwd: string, relPath: string): string | null {
    const normalizedCwd = path.resolve(cwd);
    const abs = path.resolve(normalizedCwd, relPath || ".");
    if (abs === normalizedCwd) return abs;
    if (abs.startsWith(normalizedCwd + path.sep)) return abs;
    return null;
  }
  ```
  Note the existing `+ path.sep` check is **correct** for the prefix false
  positive (`/work-evil` does not match `/work` + sep) — keep that behavior.
- `testeiya/src/api/files-read.ts:17` — `const abs = safeResolve(session.cwd, relPath)`
  then `fs.statSync(abs)` / `fs.readFileSync(abs, "utf8")`. The path it reads
  **must exist**.
- `testeiya/src/api/files-write.ts:32-38` — `const abs = safeResolve(...)` then
  `fs.mkdirSync(path.dirname(abs), { recursive: true })` and
  `fs.writeFileSync(abs, content)`. The path **may not exist yet** (it's being
  created), so you cannot `realpath` the file itself — you must realpath the
  nearest existing ancestor.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests | `cd testeiya && bun test src/workspace/safe-path.test.ts` | all pass |
| All tests | `cd testeiya && bun test` | all pass |
| Backend typecheck | `cd testeiya && npx tsc --noEmit` | no new errors |

## Scope

**In scope** (submodule):
- `testeiya/src/workspace/safe-path.ts`
- `testeiya/src/workspace/safe-path.test.ts` (create)

**Out of scope** (do NOT touch):
- `files-read.ts` / `files-write.ts` callers — `safeResolve` keeps the same
  signature and `null`-on-reject contract, so callers need no change.
- `workspace-search.ts` and any other caller — same reason.

## Git workflow

- Submodule: `cd testeiya`, branch `advisor/008-safe-path-symlink`, commit
  `resolve symlinks in safeResolve to prevent sandbox escape`.

## Steps

### Step 1: Re-check containment against the real path

Update `safeResolve` to, after the lexical check passes, resolve symlinks and
re-verify containment against `realpathSync(cwd)`. Handle the write case (path
may not exist) by walking up to the nearest existing ancestor. Target shape:

```ts
import path from "node:path";
import fs from "node:fs";

export function safeResolve(cwd: string, relPath: string): string | null {
  const normalizedCwd = path.resolve(cwd);
  const abs = path.resolve(normalizedCwd, relPath || ".");

  // Lexical containment (also rejects the `/work` vs `/work-evil` false positive).
  if (abs !== normalizedCwd && !abs.startsWith(normalizedCwd + path.sep)) {
    return null;
  }

  // Real-path containment: a symlink inside the workspace must not point out.
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

// Realpath the deepest existing ancestor of `p` (so a not-yet-created write
// target resolves through any symlinked parent dirs but doesn't require the
// leaf to exist).
function realpathExistingPrefix(p: string): string {
  let current = p;
  for (;;) {
    try {
      return fs.realpathSync(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return current; // reached root
      current = parent;
    }
  }
}
```

Place the `function` declaration at the end of the file (repo convention:
declarations after the main export).

> Important: the function still returns the **lexical** `abs` (not the realpath)
> on success, so callers read/write the path the user named — only the
> *containment decision* uses realpath. This keeps behavior identical for the
> normal (no-symlink) case.

**Verify**: `cd testeiya && npx tsc --noEmit` → no new errors.

### Step 2: Tests

Create `testeiya/src/workspace/safe-path.test.ts` using temp dirs (model on plan
001). Cover:

1. **Normal file inside** → returns the absolute path.
2. **`..` traversal** (`safeResolve(cwd, "../outside.txt")`) → `null`.
3. **Absolute path outside** (`safeResolve(cwd, "/etc/passwd")`) → `null`.
4. **Prefix false positive** — create sibling dirs `work` and `work-evil`;
   `safeResolve(work, "../work-evil/x")` → `null` (already handled lexically).
5. **Symlink escape (read)** — inside `cwd`, create a symlink `link` →
   `/tmp/<outside-dir>`; `safeResolve(cwd, "link/secret.txt")` → `null`.
6. **Symlinked parent for a new write** — inside `cwd`, `sub` is a symlink to an
   outside dir; `safeResolve(cwd, "sub/new.txt")` (leaf doesn't exist) → `null`.
7. **Legitimate not-yet-existing write** — `safeResolve(cwd, "newdir/new.txt")`
   where `newdir` doesn't exist and nothing is symlinked → returns the path (must
   NOT be rejected; this is the common create-a-file case).

Use `fs.symlinkSync(target, linkPath)` for symlink cases; guard with a try/catch
and `test.skip` if the platform forbids symlink creation (record that in your
report).

**Verify**: `cd testeiya && bun test src/workspace/safe-path.test.ts` → all pass.

### Step 3: Full check

**Verify**: `cd testeiya && bun test` → all pass.

## Test plan

- New `testeiya/src/workspace/safe-path.test.ts` (7 cases above). Case 7 is the
  critical guard that the hardening did **not** break legitimate file creation.
- Verification: `cd testeiya && bun test` → all pass.

## Done criteria

ALL must hold:

- [ ] `safeResolve` re-checks containment via `realpathSync` (deepest existing
      ancestor for non-existent targets) and returns `null` on symlink escape
- [ ] Legitimate not-yet-existing write targets are still allowed (case 7 passes)
- [ ] The `/work` vs `/work-evil` false positive is still rejected (case 4)
- [ ] `cd testeiya && bun test` exits 0 including the new suite
- [ ] `cd testeiya && npx tsc --noEmit` no new errors
- [ ] No caller files modified (`cd testeiya && git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match live code (drift).
- `realpathSync(cwd)` throws because the workspace dir legitimately doesn't exist
  at call time in some flow — if a caller relies on `safeResolve` for a cwd that
  doesn't exist yet, STOP and report (the current code tolerates a non-existent
  leaf but assumes `cwd` exists).
- Case 7 (legitimate new file) is rejected by your implementation and you can't
  fix it without weakening the symlink check — STOP and report.

## Maintenance notes

- There is a TOCTOU gap in principle (symlink swapped between check and use) but
  it requires write access to the workspace already; the realpath check closes the
  practical hole. Note this for reviewers.
- Related hardening folded here per the index: the static-file server
  (`app-server.ts:244-259`) lacks an explicit containment check but is currently
  protected by URL normalization — if anyone later decodes the path or changes the
  router, mirror this realpath-containment approach there.
- A reviewer should confirm the function still returns the user-named path (not
  the realpath) so file contents/paths reported back to the UI are unchanged.
