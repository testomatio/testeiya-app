# Plan 012: Investigate + fix the global `TESTOMATIO` token bleed

> **Executor instructions**: This plan starts with an **investigation step** that
> decides which fix to apply. Do Step 1 first and follow its branch. Run every
> verification command. Honor STOP conditions. Update `plans/README.md` when done.
>
> **This plan edits the `testeiya/` submodule** (`src/connection.ts`, possibly
> `src/session-factory.ts`). Commit inside the submodule.
>
> **Drift check (run first)**:
> `cd testeiya && git diff --stat 81696d8..HEAD -- src/connection.ts src/session-factory.ts src/check-tests.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches how the agent's shell gets credentials)
- **Depends on**: 001 (test harness, for any added test)
- **Category**: bug / security
- **Planned at**: root `28e0468`, `testeiya` submodule `81696d8`, 2026-06-11

## Why this matters

Per WebSocket connection, the server writes the project token into **process-global**
`process.env.TESTOMATIO` (and `TESTOMATIO_URL`). Two problems:

1. **First-token-only.** When a session has ≥2 projects, only `tokens[0]` is
   exported, so every `bash`/`check-tests push` the agent runs uses project #1's
   token regardless of which project it's editing — silent wrong-target writes.
2. **Cross-session bleed.** The unified server is one process serving many WS
   connections. `process.env.TESTOMATIO` set by connection A is visible to
   connection B's agent shell calls. In hosted/web mode (multiple users/tabs),
   a shell command in session A can run against session B's project/backend.

Note the in-app pull and the Sync button are **not** affected: `check-tests.ts`
already builds a per-call env (`{ ...process.env, TESTOMATIO: opts.token }`,
line 26). The hazard is specifically the **agent's own shell tool**, which inherits
`process.env`.

## Current state

- `testeiya/src/connection.ts:75-84` — the global writes, per prompt:
  ```ts
  sessionCwd = sessionParams.cwd || process.cwd();
  if (sessionParams.backendUrl) {
    process.env.TESTOMATIO_URL = sessionParams.backendUrl;
  }
  const tokenEntries = sessionParams.tokens
    ? Object.entries(sessionParams.tokens)
    : [];
  if (tokenEntries.length > 0) {
    process.env.TESTOMATIO = tokenEntries[0][1] as string;   // <-- first token only, global
  }
  ```
- `testeiya/src/session-factory.ts:204,276-285` — the system prompt tells the
  agent the token is available as `$TESTOMATIO` and to run `npx check-tests push`
  directly ("credentials are already in scope"). So the agent's `bash` tool is
  expected to read `TESTOMATIO` from its environment.
- `testeiya/src/check-tests.ts:26` — already correct (per-call env), confirming
  the right pattern.
- The agent session is built by `createAgentSession(...)` in `session-factory.ts`.
  Whether that API lets you set a **per-session bash/tool environment** is the
  open question this plan's Step 1 answers.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Find SDK env hook | `grep -rn "env" testeiya/node_modules/@oh-my-pi/pi-coding-agent/dist/**/*.d.ts \| grep -i "bash\|tool\|exec\|session" \| head -40` | shows whether a per-session env option exists |
| Backend typecheck | `cd testeiya && npx tsc --noEmit` | no new errors |
| Tests | `cd testeiya && bun test` | all pass |
| Server boots | `cd testeiya && PORT=0 timeout 5 bun src/app-server.ts 2>&1 \| head` | "listening" |

## Scope

**In scope** (submodule):
- `testeiya/src/connection.ts`
- `testeiya/src/session-factory.ts` — only if Step 1 finds a per-session env hook.
- A test if feasible (see Step 3).

**Out of scope** (do NOT touch):
- `check-tests.ts` — already correct.
- The system prompt's wording about credentials — unless the chosen branch makes
  the `$TESTOMATIO` claim false (then update it; see branches).

## Git workflow

- Submodule: `cd testeiya`, branch `advisor/012-token-env`, commit per the branch
  taken (e.g. `pass per-session TESTOMATIO env to agent shell` or
  `stop clobbering global TESTOMATIO; guard multi-project + document`).

## Steps

### Step 1: Investigate the SDK's per-session tool environment (decides the branch)

Determine whether `createAgentSession` (or the session object / its bash tool)
accepts a **per-session environment** for shell execution. Inspect the SDK types:

```
grep -rn "createAgentSession" testeiya/node_modules/@oh-my-pi/pi-coding-agent/dist 2>/dev/null | head
grep -rni "env" testeiya/node_modules/@oh-my-pi/pi-coding-agent/dist/**/*.d.ts 2>/dev/null | grep -i "bash\|exec\|tool\|spawn\|session\|cwd" | head -40
```

Read the option type for `createAgentSession` and the bash tool config.

- **Branch A — a per-session env option exists** (e.g. an `env`, `shellEnv`, or
  `bashEnv` field on the session/tool options). Go to Step 2A.
- **Branch B — no per-session env hook exists** (the bash tool always inherits
  `process.env`). Go to Step 2B.

Record which branch you took and the evidence (the type/field you found, or your
confirmation that none exists) in your report.

### Step 2A: Thread per-session credentials (preferred fix)

In `session-factory.ts`, pass the session's token(s) and `backendUrl` to the bash
tool's environment via the SDK option you found, instead of relying on the global.
- For a **single-project** session: set `TESTOMATIO` + `TESTOMATIO_URL` in that
  per-session env.
- For a **multi-project** session: the agent edits one project dir at a time, but
  the shell can't know which from a single env var. At minimum, set
  `TESTOMATIO_URL` and the first token, AND keep per-project tokens available
  (e.g. `TESTOMATIO_<SLUG>` vars) so the prompt can instruct the agent which to
  use; document the chosen scheme in the system prompt.

Then in `connection.ts`, **remove** the `process.env.TESTOMATIO` /
`process.env.TESTOMATIO_URL` global writes (lines 76-84) — the per-session env
replaces them. Keep the `console.log` (adjust it to not read the globals).

**Verify**: `cd testeiya && npx tsc --noEmit` no new errors; the server boots; a
manual prompt that runs `bash` with `echo $TESTOMATIO` shows the correct token
(if you can run the app with a token configured).

### Step 2B: Stop clobbering globals unsafely; guard + document (fallback fix)

If there is no per-session env hook, the agent's shell must inherit `process.env`,
so a fully isolated fix needs an SDK feature. Apply the safe partial fix:

- In `connection.ts`, set the globals **only when the session has exactly one
  token** (the common, correct case). When there are 2+ tokens, do **not** set a
  single misleading `TESTOMATIO`; instead log a clear warning and rely on the
  per-call env in `check-tests.ts` (the agent should be steered to use
  `check-tests` rather than reading `$TESTOMATIO` directly). Target:
  ```ts
  if (tokenEntries.length === 1) {
    process.env.TESTOMATIO = tokenEntries[0][1] as string;
  } else if (tokenEntries.length > 1) {
    delete process.env.TESTOMATIO;   // avoid leaking a stale/other token
    console.warn("[session] multiple project tokens; not setting a single global TESTOMATIO");
  }
  ```
- Document the remaining cross-session limitation: add a comment at the write site
  noting that `process.env` is process-global and therefore unsafe for concurrent
  multi-user sessions in one process, and that a per-session shell env requires an
  SDK capability (link to your Step 1 finding).
- **STOP and report** after applying this partial fix, recommending an SDK feature
  request (per-session tool env) as the real fix. This is an acceptable terminal
  state for this plan — do not attempt to re-architect the single-process server.

**Verify**: `cd testeiya && npx tsc --noEmit` no new errors; server boots;
single-project sessions still export `TESTOMATIO`.

### Step 3: Test what you can

If Branch A and an `env` option exists, a unit test is hard (needs a live session).
At minimum, if you refactored token resolution into a pure helper, unit-test it
(single vs multi token → expected env map). If Branch B, a test asserting "2 tokens
→ no global `TESTOMATIO` set" is feasible by exercising the small piece of logic
(extract it to a pure function if that keeps the test simple). Skip if it would
require standing up a full session.

**Verify**: `cd testeiya && bun test` → all pass (including any added test).

## Test plan

- Branch A: manual check via `bash`/`echo $TESTOMATIO` in a running session;
  unit-test any extracted env-builder helper.
- Branch B: unit-test the single-vs-multi token guard if cheaply extractable;
  otherwise document manual verification.
- Verification: `cd testeiya && bun test` → all pass; server boots.

## Done criteria

ALL must hold (for the branch taken):

- [ ] Step 1's investigation result (Branch A or B + evidence) is recorded in the
      report
- [ ] **Branch A**: no `process.env.TESTOMATIO`/`TESTOMATIO_URL` global writes
      remain in `connection.ts`; per-session env carries credentials; server boots
- [ ] **Branch B**: globals set only for single-token sessions; multi-token logs a
      warning and sets no misleading global; the limitation is documented; a STOP
      report recommends the SDK feature
- [ ] `cd testeiya && npx tsc --noEmit` no new errors; `cd testeiya && bun test`
      passes
- [ ] No out-of-scope files modified (`cd testeiya && git status`)
- [ ] `plans/README.md` status row updated (DONE for Branch A; BLOCKED with the
      one-line SDK-feature reason for Branch B)

## STOP conditions

- The excerpts don't match live code (drift).
- Branch A: the per-session env option exists but plumbing it changes the session
  API broadly (more than `session-factory.ts` + `connection.ts`) — STOP and report
  the blast radius before proceeding.
- Branch B applies (no SDK hook) — apply the partial fix and STOP/report as
  instructed; this is expected, not a failure.

## Maintenance notes

- The real fix for concurrent multi-user hosted mode is a per-session shell
  environment from the SDK; if/when that lands, remove any remaining global writes.
- This pairs with plan 007 (auth): in hosted mode, both the call gate and per-
  session credential isolation matter.
- A reviewer should confirm the in-app pull/Sync path (`check-tests.ts`) was not
  touched (it's already correct).
