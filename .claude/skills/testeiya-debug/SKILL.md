---
name: testeiya-debug
description: Debug a Testeiya issue across the whole stack — the Bun app-server (CLI), the web/desktop UI, its MobX state, same-origin /api requests, outbound Testomat.io REST calls, and the LLM agent. Reads persistent file logs (works even when the server is dead) and pulls a live debug snapshot + Langfuse trace so you fix with full context, not guesses.
---

# Testeiya Debug

Use this when something in Testeiya misbehaves — a UI error, a request that failed, a project that won't load, a wrong agent response, a crash, a UI that won't connect — and you need to see **what actually happened** end to end before changing code. Testeiya spans four layers; this skill collects all of them into files you can read:

```
UI (React + MobX)  ──/api/*──►  Bun app-server (cli/)  ──REST──►  Testomat.io
       │                              │                              
   console, store              server stdout, LLM agent  ──►  Langfuse (traces)
```

**There are three evidence sources.** The persistent **app log** in `~/.testeiya/logs/` is written to disk as things happen and survives a crash or a UI that never connected — start here, it needs no running server. The **live snapshot** (Step 1) is richer and structured but requires the server to be up. The **Langfuse trace** (Step 1b) holds the deep per-agent-session detail (prompts, tool IO, generations). When in doubt, read the app log first; then pull the snapshot if the server is alive, and the Langfuse trace if the issue is about what the agent did.

## Step 0 — Read the persistent app log (no running server required)

Every process start writes one app log — `~/.testeiya/logs/app-<yyyyMMdd-HHmmss>-<pid>.log` — as plain, greppable, timestamped lines. It captures the **basic** interactions needed to debug LLM connection/usage and API/connection issues (it is *not* a full transcript — the deep per-session detail lives in Langfuse, Step 1b). It holds:

- A `[start]` header (mode + runtime) and a `[config]` block near the top: the resolved provider/model/permissions + an env presence summary (**no keys**).
- Every teed `console.*` line: `[api]` (noise is suppressed — the `/api/playwright/status` poll and all `/api/debug/*` plumbing), `[testomatio→]` outbound REST, `[session]` (session creation, `[session] prompt error:` on a failed turn), `[webview]` browser errors, and `[error]` for thrown errors + `uncaughtException`.
- `[ai]` LLM events — the key line for usage/connection debugging. A response looks like:
  `[ai] response — gpt-5.6-terra · stop · 5 chars · 370/5 tok · session:152c18412a32650d`
  (model · stopReason · output chars · input/output tokens · **Langfuse session id**). Retries, fallbacks, compaction, and turn errors show as `[ai] retry|fallback|compaction|error FAIL — …`.

The `session:<id>` on every `[ai]` line is the Langfuse session id — feed it straight to `bun run debug:trace session:<id>` (Step 1b) for the full transcript.

Logs older than 7 days are pruned on each start, and only the 30 newest app logs are kept (so a `bun --watch` dev loop doesn't pile up).

```bash
ls -t ~/.testeiya/logs/app-*.log | head -1                 # newest start
tail -80 "$(ls -t ~/.testeiya/logs/app-*.log | head -1)"   # crash / last activity
LOG="$(ls -t ~/.testeiya/logs/app-*.log | head -1)"
grep -n '\[config\]' "$LOG"   # how was it configured?
grep -n '\[error\]'  "$LOG"   # server errors / crashes / prompt failures
grep -n '\[ai\]'     "$LOG"   # LLM usage: model, chars, tokens, session id, retries/errors
cat ~/.testeiya/server.json   # live server: url, pid, and logFile path
```

**Decision guide:**
- **Server crashed / won't start** → the newest app log's `tail` is the whole story (look for `[error] uncaughtException`, and the `[config]` block to confirm how it was configured). The live snapshot won't work — stay here.
- **LLM connection/usage looks wrong** (slow, empty, retrying, wrong size) → grep `[ai]`: retries/fallbacks/`error FAIL` signal a provider/connection problem; `chars`/`tok` show the response size; then open the Langfuse trace for that `session:<id>`.
- **UI looks idle but nothing happens when you send a message** → the socket never reached the server. The browser's own view lands in the snapshot's `client.entries` as `ws-error` / `ws-close` / `ws-connect-timeout` (visible once the server is back). Cause is usually the agent server being down or the port blocked.
- **Server is alive** → skim the app log for the failing area, then pull the snapshot (Step 1) for the structured, correlated view.

## Step 1 — Full debug snapshot (server must be running)

```bash
cd cli
bun run debug:snapshot [agent-conversation-id]
```

Pulls `GET /api/debug/snapshot` from the **running** app-server (auto-discovered via `~/.testeiya/server.json`; falls back to `$TESTEIYA_PORT`/`$PORT`/3050). Saves `cli/log/debug-snapshot-*.json` containing:

| Field | What it holds |
|---|---|
| `server.requests[]` | Outbound Testomat.io REST calls (method, url, status, bodies, timing) |
| `server.ai[]` | LLM turn / retry / fallback / compaction events + errors + token usage |
| `server.checkTests[]` | `check-tests` pull/push sync runs (exit code + output) |
| `server.console[]` | The app-server's own stdout/stderr (`[api]`, `[testomatio→]`, `[webview]`, thrown errors) |
| `client.entries[]` | The browser's unified log: same-origin `/api/*` requests, agent-WS events (incl. `ws-open`/`ws-close`/`ws-error`/`ws-stall`/`ws-connect-timeout`), and captured `console.error`/`warn` + uncaught errors |
| `client.store` | A MobX snapshot of the UI services (current project, workspace classification, connection status, providers, …) |
| `client.meta` | url, userAgent, viewport, theme, embedded |
| `session` | The server-side session (cwd, projects, backendUrl) when you pass a session id |

> **The server must be running** (`npm run dev`, desktop, or `bun run serve:app`). If `client` is `null`, the browser hasn't reported yet — open the app, or turn on the sidebar **Debug** panel, then re-run. Errors are always reported even with the panel closed. The Debug panel subscribes to `GET /api/debug/stream` (SSE); an open panel (or `TESTEIYA_DEBUG=1`) is also what turns on the re-runnable `testomatio.http` log (1c). If the server is down, the snapshot can't be pulled — use Step 0 instead.

### 1b. Langfuse trace (the LLM's-eye view)

If the issue is about **what the agent decided** (wrong tool, bad output, hallucination), pull its trace. Get the conversation id from the snapshot's `session` / `client.store`, from the session log's `session_created` frame, or a trace id from the Langfuse UI:

```bash
bun run debug:trace session:<agent-conversation-id>   # every prompt in the chat
bun run debug:trace <trace-id>                          # one trace from the UI
bun run debug:trace 1h                                  # recent, by time range
```

Saves `cli/log/langfuse-trace-*.json` (prompts, per-call messages, tool args+results, usage, cost). Needs `LANGFUSE_*` keys — `bun run setup:env` seeds `~/.testeiya/.env`. See **Debugging** in `CLAUDE.md`.

### 1c. Re-runnable REST log (when a Testomat.io call looks wrong)

`cli/log/testomatio.http` captures each outbound Testomat.io request **with its response** as a re-runnable `.http` block. Populated while debug mode is on (Debug panel open **or** `TESTEIYA_DEBUG=1`). Read it to confirm real URLs, params, and status codes instead of guessing. It holds a live `Authorization` token — never commit or paste it.

### 1d. UI layout map (understand the rendered UI without a browser)

```bash
bun run debug:layout   # prints the big components as an indented tree
```

Pulls `GET /api/debug/layout` — the browser's last-reported map of the **meaningful container components**, nested container → child, each with size + on-screen coordinates. It is deliberately **not** the DOM: leaves/controls (button, span, svg…), thin list rows, and anonymous wrappers are dropped; single-child wrapper chains are merged; repeated siblings (lists/trees) collapse to one `N×` line. Nodes are named by their `data-slot` (the shadcn/Base UI component name), else id/role. Example:

```
div 1440×900 @0,0
  header 1440×56 @0,0
  main 1440×844 @0,56
    div 380×844 @0,56          ← sidebar region
      collapsible 380×308 @56,2052
        collapsible-content 380×280 @56,2080
    section 1060×844 @380,56
      4× card 500×300 @480,120
```

Use it to see the page's structure — where a panel/section/dialog sits, what's on screen, whether something rendered off-screen or collapsed. The map is client-captured, so it's only as fresh as the last report (page load, panel-open, or every 15s with the Debug panel on) — if it says "no layout reported yet", open the app / the Debug panel. The same tree is also in the snapshot's `client.layout`.

## Step 2 — Correlate the layers

Read the file logs and/or the snapshot and look for **mismatches between layers** — that's where bugs hide.

```bash
jq '.server.console[] | select(.level=="error")' <snapshot>          # server crashed?
jq '[.server.requests[] | select(.ok==false)]' <snapshot>            # Testomat.io REST failed?
jq '[.client.entries[] | select(.kind=="request" and (.ok==false or .status>=400))]' <snapshot>  # UI /api call failed?
jq '[.client.entries[] | select(.channel=="console" and .ok==false)]' <snapshot>                 # UI console error / uncaught
jq '[.client.entries[] | select(.name|startswith("ws-"))]' <snapshot>                            # WS connect/close/error/stall
jq '.client.store' <snapshot>                                        # what state did the UI think it was in?
jq '[.server.ai[] | select(.ok==false)]' <snapshot>                  # LLM error / exhausted retries
```

Correlate the **app log** by ISO timestamp: the app log and the snapshot stamp the same wall clock, so an `[ai]`/`[session]`/`[testomatio→]`/`[error]` line lines up with the `server.*` entries in the snapshot. For the full per-turn detail behind an `[ai]` line, jump to its Langfuse trace via the `session:<id>` it carries.

Trace a failure **downstream to upstream**:
- UI shows an error → find the `client.entries` request that failed → find the matching `server.requests` (the real Testomat.io call) → check `server.console` / the app log `[error]` lines for the thrown error → confirm the exact request/response in `testomatio.http`.
- UI won't connect → check `client.entries` for `ws-error`/`ws-close`/`ws-connect-timeout`, and the app log for `Client connected`/`[ws] upgrade failed`; no `Client connected` means the socket never reached the server (server down / port blocked).
- Agent gave a bad answer → grep `[ai]` in the app log for the `session:<id>`, then open its Langfuse trace → read the `GENERATION` input (what the model saw) vs. the tool `output` (what actually happened).
- UI looks wrong but no request failed → inspect `client.store`: is the workspace classification / current project / connection status what you expect? A stale or wrong store value is the bug.

## Step 3 — Common failure patterns

| Symptom | Look at | Likely cause |
|---|---|---|
| UI looks idle, message never gets a reply | `client.entries` `ws-close`/`ws-connect-timeout`; no `Client connected` in the app log | Agent server down / port blocked / wrong WS URL |
| Server crashed / won't start | Newest `app-*.log` tail (`[error] uncaughtException`, the `[config]` block) | Bad config, thrown at boot, missing dep |
| Crash mid-turn | App-log tail has the throw (`[error]` / `[session] prompt error:`); the `[ai]` line for that `session:<id>` shows `error FAIL` | Handler threw, provider crash |
| Red error banner in the app | `server.console` / app-log `[error]` + failing `/api/*` in `client.entries` | Missing API key, unreachable backend, thrown handler |
| Project won't load / empty tree | `server.requests` (v2 REST status), `client.store.workspace`/`project` | Bad token, wrong `TESTOMATIO_URL`, classification (`resolveManualTestsDir`) |
| Pull/Push does nothing or errors | `server.checkTests`, `client.entries` `/api/workspace/sync` | Token resolution, dir classification |
| Agent picked the wrong tool / bad output | Langfuse trace (`session:<id>` from the `[ai]` line) `GENERATION` input + tool observations | Prompt/context gap, wrong skill, missing MCP tool |
| Agent turn failed / retried | App-log `[ai]` (`retry`/`fallback`/`error FAIL`) or `server.ai` | Provider error, context overflow → compaction |
| Slow / oversized LLM response | App-log `[ai] response` `chars` + `tok`; the Langfuse generation | Big context, runaway output |
| UI crash / blank | `client.entries` `console`/`uncaught`, app-log `[webview]` | React render error, bad state |

## Step 4 — Fix, then verify

Make the **smallest change** that addresses the root cause (follow the repo's Code Style in `CLAUDE.md`). Then confirm it end to end:

1. Reproduce the original action in the running app.
2. Re-run `bun run debug:snapshot` (or re-read the app log) and check the failing entry is gone (0 errors).
3. For agent-behavior fixes, re-run the scenario and re-pull the Langfuse trace.

## Going deeper (optional)

The app log + snapshot + store cover most bugs — you should rarely need the live browser. When you do (network waterfall, DOM, a screenshot):
- **Web app:** drive the page with the chrome-devtools MCP or Playwright against `http://localhost:3050`.
- **Desktop:** the Electrobun webview can expose a remote-debugging port for Chrome DevTools; see the `electrobun-debugging` skill.

## How capture is wired (reference)

- App log: `cli/src/file-log.ts` (`initFileLog`, `logStartupConfig`, `logApp`) — the `~/.testeiya/logs/app-*.log` console tee + config header, shared by every surface, 7-day + 30-file prune. The live app log's path is published in `~/.testeiya/server.json` (`logFile`).
- Server (in-memory + snapshot): `cli/src/debug-bus.ts` (ring buffer, `captureServerConsole`, `buildSnapshot`, `teeToAppLog` for `[ai]`/`[check-tests]`), endpoints `cli/src/api/debug-{stream,snapshot,report}.ts`, `~/.testeiya/server.json` from `cli/src/server-info.ts`; prompt-error capture in `cli/src/connection.ts`; LLM events + the `session:<id>` tag in `cli/src/ai-debug.ts`.
- Client: `lib/debug/external-log.ts` (`initConsoleCapture`, `logAgentEvent`, `logWsEvent`), `lib/services/debug-log-service.ts` (`report()` → `POST /api/debug/report`, flush-on-reconnect), `lib/debug/store-snapshot.ts`; WS lifecycle capture in `hooks/use-testeiya.ts`.
- Scripts: `cli/scripts/debug-snapshot.ts`, `cli/scripts/langfuse-trace.ts`.
