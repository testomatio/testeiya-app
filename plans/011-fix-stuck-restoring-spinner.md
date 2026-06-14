# Plan 011: Fix the stuck "Restoring…" spinner

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the ROOT repo only** (`lib/services/project-service.ts`).
>
> **Drift check (run first)**:
> `git diff --stat 28e0468..HEAD -- lib/services/project-service.ts app/page.tsx`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: root `28e0468`, 2026-06-11

## Why this matters

`restoreLast()` sets the observable `restoring = true`, then `await`s
`selectProject(...)`, but only resets `restoring` to `false` in the `catch`. On
the **success** path it never resets. The empty-state UI shows a "Restoring your
last project…" spinner while `restoring` is true and relies on navigation
unmounting the component to clear it — but `navigate` uses `router.replace`
(same-component, no unmount), so any flow where the session resolves yet the
chat stays empty leaves a permanent spinner.

## Current state

- `lib/services/project-service.ts:191-208`:
  ```ts
  /** On a cold load with no session, reopen the last-used project (once). */
  async restoreLast(): Promise<void> {
    if (this.restoreAttempted) return;
    this.restoreAttempted = true;
    const cached = readCache();
    const last = cached?.selectedProjectId;
    if (!cached?.connected || !last) return;
    runInAction(() => {
      this.restoring = true;
    });
    try {
      await this.selectProject(last);
    } catch {
      runInAction(() => {
        this.restoring = false;
      });
    }
  }
  ```
- The class uses MobX (`runInAction` for observable mutations). `restoring` is an
  observable on the service; `app/page.tsx` reads it to show the spinner (around
  lines 706-712).
- `selectProject` (lines 182-189) calls `this.root.navigate(session.sessionId)`,
  which is a `router.replace` — it does not unmount `ChatPage`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run lint` | exit 0 |
| Typecheck | `npx tsc --noEmit` (root) | no new errors |
| Build UI | `bun run build` | exit 0 |

## Scope

**In scope**:
- `lib/services/project-service.ts` (root)

**Out of scope** (do NOT touch):
- `app/page.tsx` spinner rendering — the fix is purely the state reset.
- `selectProject`/`navigate` behavior — leave the `router.replace` as-is.

## Git workflow

- Branch: `advisor/011-restoring-finally`.
- Commit (conventional): `fix: reset restoring flag on restoreLast success path`.

## Steps

### Step 1: Reset `restoring` in a `finally`

Move the reset out of `catch` into a `finally` so it runs on both success and
failure. Note the repo convention bans nested `try`/`catch` and prefers minimal
change — a `try/finally` with the existing `catch` removed (the error was only
used to reset the flag) is cleanest. Target shape:

```ts
runInAction(() => {
  this.restoring = true;
});
try {
  await this.selectProject(last);
} finally {
  runInAction(() => {
    this.restoring = false;
  });
}
```

> If you prefer to keep error visibility, you may retain a `catch` that logs, but
> the flag reset must be in `finally`. Do not introduce a nested try/catch.

**Verify**: `grep -n "this.restoring = false" lib/services/project-service.ts`
shows the reset inside a `finally` block.

### Step 2: Lint, typecheck, build

**Verify**: `bun run lint` → 0; `npx tsc --noEmit` → no new errors; `bun run build`
→ 0.

## Test plan

- No frontend test harness. Manual verification (record results): with a cached
  last project, cold-load the app and confirm the "Restoring…" spinner disappears
  once the project loads (success path), and also when restore fails (e.g. an
  invalid cached project id) the spinner clears and the normal empty state shows.
- If you cannot run the app, rely on the lint/typecheck/build gates and code
  review of the `finally`.

## Done criteria

ALL must hold:

- [ ] `restoring` is reset to `false` in a `finally` (runs on success and failure)
- [ ] No nested `try`/`catch` introduced
- [ ] `bun run lint` exits 0; `npx tsc --noEmit` no new errors; `bun run build`
      exits 0
- [ ] No files outside `lib/services/project-service.ts` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match live code (drift).
- `selectProject` is found to unmount `ChatPage` after all (making the bug
  non-reproducible) — the `finally` fix is still correct and harmless; note the
  observation and proceed.

## Maintenance notes

- If project switching is ever changed to fully remount the page, this `finally`
  remains correct (idempotent).
- A reviewer should confirm `restoring` has no other writer that could re-set it
  to `true` after restore completes.
