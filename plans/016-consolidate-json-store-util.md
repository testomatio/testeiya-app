# Plan 016: Consolidate JSON read-modify-write into a shared util

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the `testeiya/` submodule** (a new util + several call sites).
> Commit inside the submodule.
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- src/api/mcp.ts src/config.ts src/workspace-model.ts src/testomatio-auth.ts`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 006 (introduces the atomic temp-file+rename write; 016 lifts it
  into the shared util). If 006 hasn't landed, create the helper here.
- **Category**: tech-debt / bug (atomic writes)
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

The `try { JSON.parse(readFileSync(...)) } catch { fallback }` read pattern and
its read-modify-write-preserving-other-keys variant are hand-rolled in ~6 modules,
each with its own error handling, `mkdirSync` dance, and **non-atomic** write. Bug
fixes (atomic writes, file mode, encoding) must be applied N times, and the
duplication has already drifted (`config.ts` has two near-identical save
functions; `mcp.json` toggle/add/remove is a non-atomic read-modify-write that can
lose concurrent edits). A single `readJson`/`writeJson`/`updateJson` util with
atomic writes removes the duplication and makes every JSON store crash-safe.

## Current state

The `readJson` helper already exists, scoped to one file:
- `testeiya/src/api/mcp.ts:61-67`:
  ```ts
  function readJson<T>(file: string, fallback: T): T {
    try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; }
    catch { return fallback; }
  }
  ```

The same shape is hand-rolled in:
- `testeiya/src/workspace-model.ts:60-70` (`readProjectMeta` — `JSON.parse` +
  try/catch + validation).
- `testeiya/src/config.ts:75-87` (load loop), `:106-133` (`saveProviderSelection`
  — read-modify-write), `:139-152` (`saveThinkingLevel` — read-modify-write,
  near-identical to the previous).
- `testeiya/src/testomatio-auth.ts` (credential read/write — note: writes with
  mode `0o600`, which the util must support as an option).
- `testeiya/src/api/agent-start.ts` (a `readJson`-style read).
- `testeiya/src/session-store.ts` — if plan 006 landed, it already has the atomic
  write; the util should match that implementation.

The mcp.json writers (`writeCatalog`/`writeDisabled`/`applyEnabledSet`,
`mcp.ts:88-125`) use plain `writeFileSync` (non-atomic).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `cd testeiya && npx tsc --noEmit` | no new errors |
| Tests | `cd testeiya && bun test` | all pass |
| Server boots | `cd testeiya && PORT=0 timeout 5 bun src/app-server.ts 2>&1 \| head` | "listening" |

## Scope

**In scope** (submodule):
- `testeiya/src/json-store.ts` (create) — `readJson`, `writeJson`, `updateJson`.
- `testeiya/src/json-store.test.ts` (create).
- Refactor call sites to use it: `api/mcp.ts`, `config.ts`, `workspace-model.ts`
  (`readProjectMeta`/`writeProjectMeta`), `testomatio-auth.ts`,
  `api/agent-start.ts`. **One module at a time**, verifying after each.

**Out of scope** (do NOT touch):
- Behavior changes beyond making writes atomic and dedup — keep every function's
  inputs/outputs/validation identical.
- `session-store.ts` — if 006 landed it's already correct; you may optionally route
  it through the util only if it's a pure no-op refactor, otherwise leave it.
- The `0o600` mode for credential files must be **preserved** (pass it as an
  option) — do not loosen file permissions.

## Git workflow

- Submodule: `cd testeiya`, branch `advisor/016-json-store-util`. Consider one
  commit per migrated module so a regression is easy to bisect, e.g.
  `add json-store util`, then `route config.ts through json-store`, etc.

## Steps

### Step 1: Create `testeiya/src/json-store.ts`

```ts
import fs from "node:fs";
import path from "node:path";

export function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; }
  catch { return fallback; }
}

export function writeJson(file: string, value: unknown, opts?: { mode?: number }): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), opts?.mode ? { mode: opts.mode } : undefined);
  fs.renameSync(tmp, file);
  if (opts?.mode) fs.chmodSync(file, opts.mode);   // rename may not carry mode on all platforms
}

export function updateJson<T extends Record<string, unknown>>(
  file: string,
  fallback: T,
  patch: (current: T) => T,
  opts?: { mode?: number }
): T {
  const next = patch(readJson<T>(file, fallback));
  writeJson(file, next, opts);
  return next;
}
```

**Verify**: `cd testeiya && npx tsc --noEmit` → no errors in `json-store.ts`.

### Step 2: Test the util

Create `testeiya/src/json-store.test.ts` (temp dir; model on plan 001):
1. `readJson` returns fallback for a missing/garbage file; parses a valid one.
2. `writeJson` then `readJson` round-trips; the file exists and is valid JSON.
3. `updateJson` preserves untouched keys while changing one.
4. `writeJson` with `mode: 0o600` produces a file with `0o600` perms
   (`fs.statSync(file).mode & 0o777 === 0o600`) — skip the assertion on platforms
   without POSIX perms, noting it.

**Verify**: `cd testeiya && bun test src/json-store.test.ts` → all pass.

### Step 3: Migrate call sites one module at a time

For each module, replace the hand-rolled read/write with the util, preserving
behavior:
- `config.ts`: collapse `saveProviderSelection` + `saveThinkingLevel` to use
  `updateJson(userConfigPath(), {}, (c) => ({ ...c, ... }))`. Keep the load loop's
  layering logic; only its per-file read can use `readJson`.
- `workspace-model.ts`: `readProjectMeta` uses `readJson` then keeps its
  validation; `writeProjectMeta` uses `writeJson` (it also writes a `.gitignore` —
  leave that line).
- `testomatio-auth.ts`: use `writeJson(file, val, { mode: 0o600 })`; confirm the
  resulting perms match the old explicit `chmod`.
- `api/mcp.ts`: replace the local `readJson` with the imported one; make
  `writeDisabled`/`writeCatalog`/`applyEnabledSet` use `writeJson` (atomic).
- `api/agent-start.ts`: route its read through `readJson`.

**Verify after each module**: `cd testeiya && npx tsc --noEmit` → no new errors,
and `cd testeiya && bun test` → all pass.

### Step 4: Full check

**Verify**: `cd testeiya && bun test` → all pass; `npx tsc --noEmit` → no new
errors; server boots.

## Test plan

- New `testeiya/src/json-store.test.ts` (4 cases).
- Existing suites (`workspace-model`, `session-store`, `mcp`, `safe-path`,
  `testomatio-proxy` from earlier plans) must still pass after the migration —
  they are the regression guard that behavior didn't change.
- Verification: `cd testeiya && bun test` → all pass.

## Done criteria

ALL must hold:

- [ ] `testeiya/src/json-store.ts` exists with `readJson`/`writeJson`/`updateJson`,
      writes atomically (temp + rename), supports a `mode` option
- [ ] `json-store.test.ts` passes (incl. mode-preservation where supported)
- [ ] `mcp.ts`, `config.ts`, `workspace-model.ts`, `testomatio-auth.ts`,
      `agent-start.ts` use the util; the per-file `readJson` in `mcp.ts` is removed
- [ ] Credential files still written with `0o600`
- [ ] `cd testeiya && bun test` exits 0; `npx tsc --noEmit` no new errors; server
      boots
- [ ] No behavior changes beyond atomicity/dedup (out-of-scope guard)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match live code (drift).
- A migrated function's behavior changes (a test that passed now fails) and it's
  not a pure atomicity difference — STOP, revert that module, and report.
- `renameSync` crosses filesystems for any target (it shouldn't — same dir) —
  STOP and report.
- `chmod`/mode handling can't reproduce `0o600` on the target platform — keep the
  original explicit `chmod` for credentials and note it.

## Maintenance notes

- New JSON stores should use `json-store.ts` rather than re-rolling read/write.
- This makes the mcp.json toggle/add/remove writes atomic, reducing (not fully
  eliminating) the concurrent-edit lost-update window; full serialization of mcp
  edits is a smaller follow-up if it proves needed.
- A reviewer should diff each migrated function against its original to confirm
  identical inputs/outputs.
