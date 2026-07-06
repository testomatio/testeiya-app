---
name: testeiya-debug
description: Debug a Testeiya issue across the whole stack — the Bun app-server (CLI), the web/desktop UI, its MobX state, same-origin /api requests, outbound Testomat.io REST calls, and the LLM agent. Pulls a live debug snapshot + Langfuse trace so you fix with full context, not guesses.
---

# Testeiya Debug

Use this when something in Testeiya misbehaves — a UI error, a request that failed, a project that won't load, a wrong agent response, a crash — and you need to see **what actually happened** end to end before changing code. Testeiya spans four layers; this skill collects all of them into files you can read:

```
UI (React + MobX)  ──/api/*──►  Bun app-server (cli/)  ──REST──►  Testomat.io
       │                              │                              
   console, store              server stdout, LLM agent  ──►  Langfuse (traces)
```

## Step 1 — Collect the evidence

Run these from the repo (`cd cli`). Each writes a gitignored file under `cli/log/` and prints a summary.

### 1a. Full debug snapshot (start here)

```bash
bun run debug:snapshot [agent-conversation-id]
```

Pulls `GET /api/debug/snapshot` from the **running** app-server (auto-discovered via `~/.testeiya/server.json`; falls back to `$TESTEIYA_PORT`/`$PORT`/3050). Saves `cli/log/debug-snapshot-*.json` containing:

| Field | What it holds |
|---|---|
| `server.requests[]` | Outbound Testomat.io REST calls (method, url, status, bodies, timing) |
| `server.ai[]` | LLM turn / retry / fallback / compaction events + errors + token usage |
| `server.console[]` | The app-server's own stdout/stderr (`[api]`, `[testomatio→]`, `[webview]`, thrown errors) |
| `client.entries[]` | The browser's unified log: same-origin `/api/*` requests, agent-WS events, and captured `console.error`/`warn` + uncaught errors |
| `client.store` | A MobX snapshot of the UI services (current project, workspace classification, connection status, providers, …) |
| `client.meta` | url, userAgent, viewport, theme, embedded |
| `session` | The server-side session (cwd, projects, backendUrl) when you pass a session id |

> **The server must be running** (`npm run dev`, desktop, or `bun run serve:app`). If `client` is `null`, the browser hasn't reported yet — open the app, or turn on the sidebar **Debug** panel, then re-run. Errors are always reported even with the panel closed.

### 1b. Langfuse trace (the LLM's-eye view)

If the issue is about **what the agent decided** (wrong tool, bad output, hallucination), pull its trace. Get the conversation id from the snapshot's `session` / `client.store`, or a trace id from the Langfuse UI:

```bash
bun run debug:trace session:<agent-conversation-id>   # every prompt in the chat
bun run debug:trace <trace-id>                          # one trace from the UI
bun run debug:trace 1h                                  # recent, by time range
```

Saves `cli/log/langfuse-trace-*.json` (prompts, per-call messages, tool args+results, usage, cost). Needs `LANGFUSE_*` keys — `bun run setup:env` seeds `~/.testeiya/.env`. See **Debugging sessions** in `CLAUDE.md`.

### 1c. Re-runnable REST log (when a Testomat.io call looks wrong)

`cli/log/testomatio.http` captures each outbound Testomat.io request **with its response** as a re-runnable `.http` block. Populated while debug mode is on (Debug panel open **or** `TESTEIYA_DEBUG=1`). Read it to confirm real URLs, params, and status codes instead of guessing. It holds a live `Authorization` token — never commit or paste it.

### 1d. File log (desktop / webview crashes)

`~/.testeiya/testeiya.log` — the desktop app mirrors server stdout and forwards **webview** uncaught errors here (`[webview] …`), the ones DevTools would show but the server never sees otherwise.

## Step 2 — Correlate the layers

Read the snapshot and look for **mismatches between layers** — that's where bugs hide.

```bash
jq '.server.console[] | select(.level=="error")' <snapshot>          # server crashed?
jq '[.server.requests[] | select(.ok==false)]' <snapshot>            # Testomat.io REST failed?
jq '[.client.entries[] | select(.kind=="request" and (.ok==false or .status>=400))]' <snapshot>  # UI /api call failed?
jq '[.client.entries[] | select(.channel=="console" and .ok==false)]' <snapshot>                 # UI console error / uncaught
jq '.client.store' <snapshot>                                        # what state did the UI think it was in?
jq '[.server.ai[] | select(.ok==false)]' <snapshot>                  # LLM error / exhausted retries
```

Trace a failure **downstream to upstream**:
- UI shows an error → find the `client.entries` request that failed → find the matching `server.requests` (the real Testomat.io call) → check `server.console` for the thrown error → confirm the exact request/response in `testomatio.http`.
- Agent gave a bad answer → open the Langfuse trace → read the `GENERATION` input (what the model saw) vs. the tool `output` (what actually happened).
- UI looks wrong but no request failed → inspect `client.store`: is the workspace classification / current project / connection status what you expect? A stale or wrong store value is the bug.

## Step 3 — Common failure patterns

| Symptom | Look at | Likely cause |
|---|---|---|
| Red error banner in the app | `server.console` errors + failing `/api/*` in `client.entries` | Missing API key, unreachable backend, thrown handler |
| Project won't load / empty tree | `server.requests` (v2 REST status), `client.store.workspace`/`project` | Bad token, wrong `TESTOMATIO_URL`, classification (`resolveManualTestsDir`) |
| Pull/Push does nothing or errors | `server.requests` (`check-tests`), `client.entries` `/api/workspace/sync` | Token resolution, dir classification |
| Agent picked the wrong tool / bad output | Langfuse trace `GENERATION` input + tool observations | Prompt/context gap, wrong skill, missing MCP tool |
| Agent turn failed silently | `server.ai` (retry/fallback/`stopReason==error`) | Provider error, context overflow → compaction |
| UI crash / blank | `client.entries` `console`/`uncaught`, `~/.testeiya/testeiya.log` `[webview]` | React render error, bad state |

## Step 4 — Fix, then verify

Make the **smallest change** that addresses the root cause (follow the repo's Code Style in `CLAUDE.md`). Then confirm it end to end:

1. Reproduce the original action in the running app.
2. Re-run `bun run debug:snapshot` and check the failing entry is gone (0 errors).
3. For agent-behavior fixes, re-run the scenario and re-pull the Langfuse trace.

## Going deeper (optional)

Console + errors + server stdout + store cover most bugs. When you need the live browser (network waterfall, DOM, a screenshot):
- **Web app:** drive the page with the chrome-devtools MCP or Playwright against `http://localhost:3050`.
- **Desktop:** the Electrobun webview can expose a remote-debugging port for Chrome DevTools; see the `electrobun-debugging` skill.

## How capture is wired (reference)

- Server: `cli/src/debug-bus.ts` (ring buffer, `captureServerConsole`, `buildSnapshot`), endpoints `cli/src/api/debug-snapshot.ts` + `debug-report.ts`, `~/.testeiya/server.json` from `cli/src/server-info.ts`.
- Client: `lib/debug/external-log.ts` (`initConsoleCapture`), `lib/services/debug-log-service.ts` (`report()` → `POST /api/debug/report`), `lib/debug/store-snapshot.ts`.
- Scripts: `cli/scripts/debug-snapshot.ts`, `cli/scripts/langfuse-trace.ts`.
