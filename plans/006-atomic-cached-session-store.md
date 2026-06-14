# Plan 006: Make the session store atomic + in-memory cached

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the `testeiya/` submodule** (`src/session-store.ts` + a new
> test). Commit inside the submodule.
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- src/session-store.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (uses `bun test` from plan 001 if available; otherwise adds
  the `test` script itself — see Step 4)
- **Category**: bug / perf
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

`sessions.json` is the source of truth for every active session (its `cwd`,
tokens, projects). The store does a **non-atomic read-modify-write** for every
mutation and a **full `readFileSync` + `JSON.parse` on every read**, and reads
happen at the top of nearly every API handler. Two consequences:

1. **Lost sessions (correctness).** Concurrent `createSession` calls — e.g. a
   cold load firing `restoreLast` and `workspace.openDefault` together, or a
   double-click on "Connect" — each `readAll()` the same array, push their own
   session, and the later `writeAll()` clobbers the earlier. The lost session's
   later `/api/files/tree`, `/api/mcp`, WS-by-id, and sync all 404. Last-write-wins
   can also resurrect a session another request just deleted.
2. **Sync I/O per request (perf).** Every handler parses the whole file
   synchronously on the event loop; `createSession`/`getSessionByCwd` parse it
   twice (via `cleanExpiredSessions`).

The fix: hold the parsed array in module memory (single-process server),
serialize all mutations through one in-process async queue, and write atomically
(temp file + rename).

## Current state

`testeiya/src/session-store.ts` (full file is 99 lines). Key parts:

```ts
const SESSIONS_FILE = path.join(HOME_DIR, "sessions.json");

function readAll(): StoredSession[] {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8")); }
  catch { return []; }
}
function writeAll(sessions: StoredSession[]): void {
  const dir = path.dirname(SESSIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}
export function createSession(data: Omit<StoredSession, "createdAt">): StoredSession {
  cleanExpiredSessions();
  const session: StoredSession = { ...data, createdAt: Date.now() };
  const sessions = readAll();
  sessions.push(session);
  writeAll(sessions);
  return session;
}
export function getSession(sessionId: string): StoredSession | null {
  const sessions = readAll();
  return sessions.find((s) => s.sessionId === sessionId) ?? null;
}
export function getSessionByCwd(cwd: string): StoredSession | null {
  cleanExpiredSessions();
  const sessions = readAll();
  const match = sessions.filter((s) => s.cwd === cwd);
  if (match.length === 0) return null;
  return match.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}
export function deleteSession(sessionId: string): void {
  const sessions = readAll();
  writeAll(sessions.filter((s) => s.sessionId !== sessionId));
}
export function cleanExpiredSessions(maxAgeMs = MAX_AGE_MS): void {
  // reads all, rms tmpdir cwds older than maxAge, writes survivors
}
```

- The server is **single-process** (`Bun.serve` in `app-server.ts`), so an
  in-memory cache + an in-process mutex is sufficient (no cross-process locking).
- `cleanExpiredSessions` has important behavior to preserve: it only `fs.rmSync`
  workspaces under `os.tmpdir()` (never persistent `~/.testeiya/workspaces` or
  user folders). Keep that exactly.
- The **public function signatures must not change** — callers across `api/*.ts`
  and `connection.ts` import `getSession`, `createSession`, `deleteSession`,
  `getSessionByCwd`, `cleanExpiredSessions`. Keep them synchronous where they are
  today (callers do not `await` them). The mutation **queue** can be internal.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `cd testeiya && npx tsc --noEmit` | no new errors |
| Tests | `cd testeiya && bun test src/session-store.test.ts` | all pass |
| All tests | `cd testeiya && bun test` | all pass |
| Server boots | `cd testeiya && PORT=0 timeout 5 bun src/app-server.ts 2>&1 \| head` | "listening" line |

## Scope

**In scope** (submodule):
- `testeiya/src/session-store.ts`
- `testeiya/src/session-store.test.ts` (create)

**Out of scope** (do NOT touch):
- Any `api/*.ts` or `connection.ts` caller — keep signatures identical so they
  need no edits.
- `mcp.json` / config read-modify-write — that's plan 016; do not generalize the
  helper here beyond `sessions.json`.
- The TTL/temp-dir deletion *policy* in `cleanExpiredSessions` — preserve it
  byte-for-byte in behavior.

## Git workflow

- Submodule: `cd testeiya`, branch `advisor/006-session-store`, commit
  `make session store atomic + in-memory cached`.

## Steps

### Step 1: Add an in-memory cache backing `readAll`

Introduce a module-level `let cache: StoredSession[] | null = null`. `readAll()`
loads from disk once on first use and returns the cached array thereafter;
`writeAll()` updates the cache then persists. Keep the on-disk format identical.

```ts
let cache: StoredSession[] | null = null;

function readAll(): StoredSession[] {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8")); }
  catch { cache = []; }
  return cache!;
}
```

Callers that mutate the returned array must not do so in place — confirm
`getSessionByCwd`/`getSession` only read. (They do.) `createSession`/`deleteSession`
build a new array via `writeAll`.

### Step 2: Atomic write + cache update

```ts
function writeAll(sessions: StoredSession[]): void {
  cache = sessions;
  const dir = path.dirname(SESSIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${SESSIONS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2));
  fs.renameSync(tmp, SESSIONS_FILE);   // atomic replace on same filesystem
}
```

### Step 3: Serialize mutations (compare-and-set, single pass)

The race is read-modify-write interleaving. With a synchronous, single-threaded
JS event loop, the *individual* `createSession`/`deleteSession` calls already run
to completion without yielding (they contain no `await`). The real interleaving
came from `cleanExpiredSessions()` being a separate read-write step before the
push. Collapse each mutation into **one** read→modify→write with no intervening
async, and have `createSession` reuse the already-read array instead of calling
`cleanExpiredSessions()` (which re-read and re-wrote). Target:

```ts
export function createSession(data: Omit<StoredSession, "createdAt">): StoredSession {
  const session: StoredSession = { ...data, createdAt: Date.now() };
  const sessions = pruneExpired(readAll());   // pure: returns survivors, rms tmp dirs
  sessions.push(session);
  writeAll(sessions);
  return session;
}
```

Refactor `cleanExpiredSessions` so its survivor-computation + temp-dir removal is
a pure helper `pruneExpired(sessions): StoredSession[]` (does the `fs.rmSync` of
expired tmp cwds, returns the alive list). Keep the **exported**
`cleanExpiredSessions()` as a thin wrapper (`writeAll(pruneExpired(readAll()))`)
so external callers and behavior are unchanged.

Because each exported mutation is now a single synchronous critical section (no
`await` inside), no explicit mutex is needed in this single-threaded runtime —
state this reasoning in a code comment so a future maintainer who adds an `await`
knows to reintroduce serialization.

> If you find any `await` is unavoidable inside a mutation, add an in-process
> async mutex (chain a module-level `let lock = Promise.resolve()`); otherwise the
> single-pass approach above is sufficient and simpler.

### Step 4: Tests

If plan 001 already added `"test": "bun test"` to `testeiya/package.json`, reuse
it. If not, add it (same one-line script).

Create `testeiya/src/session-store.test.ts`. Because the store writes to
`HOME_DIR` (`~/.testeiya`), set `HOME` to a temp dir **before importing the
module** so tests are isolated (the module computes `SESSIONS_FILE` from
`HOME_DIR` at load). Pattern:

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "ss-home-"));
process.env.HOME = home;            // must run before the dynamic import below
const store = await import("./session-store.js");

afterAll(() => fs.rmSync(home, { recursive: true, force: true }));
```

Cover:
1. `createSession` then `getSession` round-trips the session.
2. Two `createSession` calls in a row → `getSession` finds **both** (the
   regression test for the clobber: assert the first session still resolves after
   the second is created).
3. `deleteSession` removes one but leaves others.
4. `getSessionByCwd` returns the most recent for a cwd.
5. Expiry: a session with `createdAt` older than 24h whose `cwd` is under
   `os.tmpdir()` is pruned by `cleanExpiredSessions`; a persistent
   (`~/.testeiya/workspaces/...`) cwd older than 24h is **kept** (verify the
   temp-dir-only deletion policy).

**Verify**: `cd testeiya && bun test src/session-store.test.ts` → all pass.

### Step 5: Full check

**Verify**: `cd testeiya && bun test` → all pass; `npx tsc --noEmit` → no new
errors; the server boots (command in the table).

## Test plan

- New `testeiya/src/session-store.test.ts` with the 5 cases above, modeled on the
  temp-dir pattern from plan 001's `workspace-model.test.ts`.
- The critical regression test is case 2 (both sessions survive) and case 5 (TTL
  deletes only tmp workspaces).
- Verification: `cd testeiya && bun test` → all pass.

## Done criteria

ALL must hold:

- [ ] `writeAll` writes via temp-file + `renameSync` and updates an in-memory cache
- [ ] `readAll` serves from the in-memory cache after first load
- [ ] `createSession` no longer calls `cleanExpiredSessions()` as a separate
      read-write step (single pass), and exported signatures are unchanged
- [ ] The temp-dir-only deletion policy in expiry is preserved (case 5 passes)
- [ ] `cd testeiya && bun test` exits 0 including the new suite
- [ ] `cd testeiya && npx tsc --noEmit` introduces no new errors
- [ ] Server boots via `bun src/app-server.ts`
- [ ] No caller files modified (`cd testeiya && git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match live code (drift).
- A caller mutates the array returned by `getSession`/`getSessionByCwd` in place
  (would corrupt the cache) — if you find one, STOP and report; do not silently
  deep-clone on every read (perf regression) without flagging it.
- `renameSync` fails because `HOME_DIR` and the temp file land on different
  filesystems (shouldn't — same dir) — STOP and report.

## Maintenance notes

- This introduces the atomic temp-file+rename idiom. Plan 016 generalizes it into
  a shared JSON-store util reused by `config.ts`, `workspace-model.ts`,
  `testomatio-auth.ts`, and `mcp.ts` — land 006 first, then 016 can lift the
  helper.
- The in-memory cache is correct only because the server is single-process. If the
  app ever runs multiple server processes sharing `~/.testeiya`, this cache must
  be revisited (add file-mtime invalidation or a real lock). Note this in review.
- A reviewer should scrutinize that `cleanExpiredSessions` still deletes **only**
  `os.tmpdir()` workspaces.
