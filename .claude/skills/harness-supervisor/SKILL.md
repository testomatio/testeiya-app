---
name: harness-supervisor
description: Supervise-test the Testeiya agent harness end-to-end — drive the live app-server over its real WebSocket protocol as if you were the user (prompts, ask_question answers, follow-ups), against the same workspace + project the user sees in the app UI, then verify outcomes out-of-band (Testomat.io runs, browser state) and review harness behavior. Use when asked to test/replay a user scenario on the harness, validate agent behavior (did it ask vs guess?), or act on the user's behalf in the app context.
---

# Harness Supervisor

You play the **user**; the Testeiya agent is the **system under test**. You drive it over the same WS protocol the web/desktop UI speaks, so everything is real: the agent runs in the user's workspace, with the user's project token and MCP connection, and its effects (created runs, opened browser, edited files) are visible to the user in the app UI. Your driven conversation is a **separate chat conversation** (same workspace/project context) — the user can open it from the app's conversation list to re-validate the transcript.

## Step 0 — Pin the target context (MUST match what the user sees in the UI)

Never hardcode a session. Discover it, echo it back, and only then drive.

1. **Server must be running.** `~/.testeiya/server.json` holds `{url, port, pid, mode}` of the live app-server (written on start, removed on exit). No file / dead pid → ask the user to open the app (or start `npm run dev` / `cd cli && bun run serve:app`).

2. **Start from the latest Testeiya session** — that's what the user last had open in the UI:

   ```bash
   jq 'max_by(.createdAt)' ~/.testeiya/sessions.json
   ```

   It carries everything that defines "same track as the user": `sessionId`, `cwd` (**workspace folder**), `backendUrl` (**app URL**), `tokens` (**project slug → API token**), `projects` (slug + title). If the scenario names a different workspace/project, pick the matching entry from `sessions.json` instead — or ask the user to open that project in the app first (that creates/refreshes the session).

3. **Validate the session is live** (24h TTL) and the MCP connection is what you expect:

   ```bash
   curl -s "$SERVER_URL/api/agent/$SESSION_ID"
   # → 200 with cwd, projects, backendUrl, expectedMcpServers: ["testomatio-<slug>"]
   ```

4. **Echo the pinned context to the user before driving** — workspace path, project title (slug), app URL, session id — so they can confirm it matches their UI (sidebar workspace + connected project).

## Step 1 — Baseline before the scenario

Snapshot any state the scenario will mutate, **before sending the first prompt** — an agent's create can land within seconds of the prompt, and a "baseline" taken after launch will list the agent's own artifacts as pre-existing (this exact race once produced a false "the API upserted an existing run" finding). Duplicate run titles are allowed by the API, and a `runs_create` that 404s on label linking still persists the run — count entities by id, not title:

```bash
curl -s "$SERVER_URL/api/testomatio/runs?session=$SESSION_ID"       # existing runs (note ids/titles)
curl -s "$SERVER_URL/api/playwright/status?session=$SESSION_ID"     # {browserOpen, recording, incognito}
```

The `/api/testomatio/<resource>` proxy is read-only and takes the same query params as the v2 API (e.g. `testruns?run_id=<id>`).

## Step 2 — Drive the scenario

Run the driver from a scratch directory (it writes `events.jsonl` + reads `cmd.jsonl` in its cwd), in the background:

```bash
cd <scratch-dir>
bun <this-skill-dir>/ws-supervisor.ts <sessionId> "<first user prompt>"
```

- Stdout is a readable stream: `[TOOL>]`/`[TOOL<]` calls, `===== AGENT TEXT =====` replies, `##### ASK_QUESTION #####` blocks, `[DONE]` per turn, `[ERROR]`. `events.jsonl` keeps every raw frame for deep review.
- Interact by appending JSON lines to `cmd.jsonl` in the same directory:

  ```jsonl
  {"answer": {"toolCallId": "<from the ASK_QUESTION block>", "value": "<option text or free text>"}}
  {"prompt": "next user message"}
  {"quit": true}
  ```

- **Play the user faithfully.** Phrase prompts the way the scenario's user would — do not leak supervisor knowledge the user wouldn't volunteer (that's often the point of the test: does the harness *ask*?). Answer an `ask_question` with an option's exact text to mimic a click; free text also works (the channel accepts any string).
- **One turn at a time.** Wait for `[DONE]` before sending the next prompt — a prompt mid-turn throws "Agent is already processing". Session creation on the first prompt takes ~10s (MCP connect); long tool calls emit `ping` heartbeats, not silence.

## Step 3 — Verify outcomes out-of-band

Never trust the agent's final message — check the real state:

- **Testomat.io data** via the proxy: `runs`, `testruns?run_id=<id>` (per-test statuses, suite titles), `tests`, etc. Diff against the Step 1 baseline: same id = reused/upserted, new id = created.
- **Browser**: `GET $SERVER_URL/api/playwright/status?session=$SESSION_ID` for open/closed; exact tab URL via the shared named session (`testeiya`) using the **agent repo's** binary:

  ```bash
  PLAYWRIGHT_DAEMON_SESSION_DIR=$HOME/.testeiya/playwright-cli/daemon \
    cli/node_modules/.bin/playwright-cli -s=testeiya tab-list --json
  ```

- **Deeper**: `events.jsonl` is the full protocol transcript; the `testeiya-debug` skill (`bun run debug:snapshot`, `bun run debug:trace session:<conversationId>`) gives the server + LLM view of the same conversation (the `conversationId` is in the `session_created` frame).

## Step 4 — Review the harness, not just the outcome

Checklist from prior supervision runs — grade each:

1. **Ambiguity → ask, not guess.** When the target (page URL, project slug, environment, base URL) wasn't explicit, did it call `ask_question` before acting — or infer from repo fixtures/.env and act? Guessing here is the #1 observed failure.
2. **Honest reporting.** Does its summary match verified state? Diff created entities by **id** against the baseline — a `runs_create` that errored (e.g. 404 on label linking) may still have persisted an orphan run the model doesn't know about, and retries then silently duplicate. Watch for claimed verification that never ran.
3. **Scope.** Did the created entity contain only what was asked (e.g. a run with only the requested suite's tests)?
4. **Secrets hygiene.** Did it echo credentials into tool output (`playwright-cli fill` echoes values) or leave helper scripts with creds in the workspace?
5. **Efficiency.** Count failed/retried tool calls. Known traps that burn turns: the agent's `bash` tool rejects heredocs; `playwright-cli run-code` executes in browser context (no `process.env`); strict-mode selector violations on pages with duplicated ids.
6. **Recovery.** After a failure (sign-in wall, bad selector), did it recover in-turn, ask the user, or just report failure and stop?

Report: verified end-state first, then per-turn narrative, then findings most-severe-first with a suggested harness fix (usually a prompt-guidance edit in `cli/src/prompt/`).

## Cleanup

Append `{"quit": true}` to `cmd.jsonl` to close the driver. Leave scenario artifacts (runs, browser) for the user to inspect in the UI unless asked to clean up — closing their browser or deleting runs is destructive.
