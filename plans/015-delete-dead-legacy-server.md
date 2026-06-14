# Plan 015: Delete the dead legacy `server.ts`

> **Executor instructions**: Follow step by step. Run every verification command.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the `testeiya/` submodule** (deletes `src/server.ts`, updates
> a comment).
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- src/server.ts src/connection.ts`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

`testeiya/src/server.ts` is the legacy WS-only server, superseded by
`app-server.ts` (which serves the static UI + `/api/*` + the WS upgrade). No
`package.json` script runs it, and it auto-starts at module load (so it can't even
be safely imported). CLAUDE.md itself calls it "legacy." Leaving it invites new
contributors to wire against a dead path or copy its pattern. Removing it shrinks
the surface and clarifies that `app-server.ts` is the only server.

## Current state

- `testeiya/src/server.ts` (full, 46 lines): a `WebSocketServer` from `ws` that
  builds a `createConnection` per socket and auto-starts at module load
  (`startServer().catch(...)` at the bottom). It listens on
  `process.env.TESTEIYA_PORT || 3210`.
- It is referenced **only** by a comment in `testeiya/src/connection.ts:38`
  ("Extracted from server.ts so both the standalone `ws` server and the unified
  Bun app-server share it.").
- The `ws` dependency (`testeiya/package.json`) is used by `server.ts`. Before
  removing `ws`, confirm whether anything else imports it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm no imports of server.ts | `grep -rn "server.js\|server.ts\|/server\"" testeiya/src \| grep -v app-server` | only the connection.ts comment, if anything |
| Check `ws` usage | `grep -rn "from \"ws\"\|require(\"ws\")\|'ws'" testeiya/src` | shows remaining `ws` importers |
| Backend typecheck | `cd testeiya && npx tsc --noEmit` | no new errors |
| Server boots | `cd testeiya && PORT=0 timeout 5 bun src/app-server.ts 2>&1 \| head` | "listening" |

## Scope

**In scope** (submodule):
- Delete `testeiya/src/server.ts`.
- `testeiya/src/connection.ts` — only the stale comment at line 38 (optional
  wording tidy so it no longer implies a live `server.ts`).
- `testeiya/package.json` — remove `ws` + `@types/ws` **only if** Step 2 confirms
  nothing else imports `ws`.

**Out of scope**:
- `app-server.ts` and `connection.ts` logic — unchanged (connection.ts stays; it's
  the shared driver used by app-server).

## Git workflow

- Submodule: `cd testeiya`, branch `advisor/015-remove-legacy-server`, commit
  `remove dead legacy ws-only server.ts`.

## Steps

### Step 1: Confirm `server.ts` is unreferenced, then delete it

```
grep -rn "server" testeiya/src --include=*.ts | grep -v "app-server" | grep -v "session-store" | grep -iv "websocketserver"
```

Confirm the only hit pointing at `src/server.ts` is the comment in
`connection.ts:38` (no code imports it). Then delete the file:

```
git rm testeiya/src/server.ts    # run inside testeiya/
```

Optionally update the `connection.ts:38` comment to drop the implication that a
live standalone server exists (e.g. "Transport-agnostic driver used by the unified
Bun app-server.").

**Verify**: `cd testeiya && npx tsc --noEmit` → no new errors (nothing imported
the deleted file).

### Step 2: Decide on the `ws` dependency

```
grep -rn "\"ws\"\|'ws'" testeiya/src
```

- If `ws`/`@types/ws` are now imported by **nothing** in `src/`, remove both from
  `testeiya/package.json` and run `bun install`.
- If anything still imports `ws`, leave the dependency and note it in your report.

**Verify**: if you removed `ws`, `cd testeiya && bun install` exits 0 and
`cd testeiya && npx tsc --noEmit` still passes.

### Step 3: Confirm the real server still boots

**Verify**: `cd testeiya && PORT=0 timeout 5 bun src/app-server.ts 2>&1 | head`
→ logs the listening line.

## Test plan

- No unit test. Gates: typecheck passes after deletion; the app-server still boots;
  `ws` removed only if unused.

## Done criteria

ALL must hold:

- [ ] `testeiya/src/server.ts` is deleted
- [ ] `grep -rn "src/server" testeiya/src` shows no code import of it
- [ ] `cd testeiya && npx tsc --noEmit` no new errors
- [ ] `ws`/`@types/ws` removed from `testeiya/package.json` **iff** unused
      elsewhere (otherwise left, with a note)
- [ ] App-server boots via `bun src/app-server.ts`
- [ ] No out-of-scope files modified (`cd testeiya && git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The grep finds a real code import of `server.ts` (drift — it became live) —
  STOP and report; do not delete.
- Removing `ws` breaks the typecheck/boot — restore it and report the remaining
  importer.

## Maintenance notes

- After this, `app-server.ts` is unambiguously the only server entry; update any
  doc that still mentions `ws://localhost:3210` standalone mode (docs cleanup is a
  separate DX item).
- A reviewer should confirm `connection.ts` (the shared driver) is untouched
  except for the comment.
