# Debugging Testeiya

An agent app fails differently than a regular app. When an answer is wrong, the cause can live in any of four layers — the UI state, the app-server, the Testomat.io REST API, or the LLM's own decisions — and the symptom rarely points at the right one. Testeiya ships tooling that makes every layer observable, so you fix with evidence instead of guesses.

```
Browser UI (MobX stores, /api + WS log)
   │
Bun app-server (console, API routes, agent session)
   ├──► Testomat.io REST  (outbound requests)
   └──► LLM provider      (generations + tool calls)
```

The toolkit, from quickest to deepest:

| Tool | What it shows | When to reach for it |
|---|---|---|
| [Debug panel](#the-debug-panel) | Live requests, agent events, client store | First look at any misbehavior |
| [`testomatio.http`](#re-runnable-api-log-testomatiohttp) | Every outbound Testomat.io call, re-runnable | "What did the API actually return?" |
| [Debug snapshot](#the-debug-snapshot) | Server + browser state merged into one JSON | Bugs that span layers |
| [Langfuse trace](#langfuse-the-llms-eye-view) | Every prompt, generation, and tool call | "Why did the agent do *that*?" |

## The debug panel

Enable it in **Settings → Debug panel**. A Debug section appears in the sidebar with three tabs:

- **Store** — a live snapshot of the client's MobX stores. A wrong-looking UI with no failed request is usually a stale store value; check here first.
- **Requests** — every outbound Testomat.io call with method, status, and latency, as it happens.
- **CLI** — the app-server's console output.

![Debug panel with live requests](../images/debug-panel.png)

While the panel is open, debug mode is on: the server records requests and the browser continuously reports its state (errors are reported even with the panel closed). The panel header also has an **Open Storybook** shortcut.

## Re-runnable API log: `testomatio.http`

With debug mode on (panel open, or `TESTEIYA_DEBUG=1`), every outbound Testomat.io call is appended to `cli/log/testomatio.http` as a re-runnable block, with the response captured as comments:

```http
### GET runs — 2026-06-21T21:16:31.591Z → 200 (145ms)
GET https://app.testomat.io/api/v2/testomat-uat/runs?per_page=1
Authorization: Bearer <token>
Accept: application/json

# ── response 200 (145ms) ──
# {"data":[{"kind":"automated","status":"failed","id":"cabd4222", ...}],"meta":{"total":1020}}
```

Open the file in the VS Code REST Client or JetBrains HTTP client and replay any request as-is. When you need to know how the API *actually* behaves — real URLs, params, status codes, response shapes — read this file instead of guessing.

> [!CAUTION]
> The file contains your live `Authorization` token. It's gitignored; never commit or paste it.

## The debug snapshot

For bugs that span the UI, the server, and the REST layer, pull everything into one JSON:

```bash
cd cli
bun run debug:snapshot [agent-conversation-id]
# → cli/log/debug-snapshot-<ts>.json
```

The script auto-discovers the running server — including the desktop app's random port — via `~/.testeiya/server.json`. The snapshot merges:

- `server.requests` — outbound Testomat.io REST calls (URL, status, duration, bodies)
- `server.ai` — LLM events: model, stop reason, duration, token usage per generation
- `server.console` — the app-server's own stdout
- `client.entries` — the browser's unified `/api/*` + agent-WebSocket log
- `client.store` / `client.meta` — the MobX store snapshot and environment

Correlate **downstream → upstream**: a failing request in `client.entries` → the matching real call in `server.requests` → the thrown error in `server.console` → the exact replayable request in `testomatio.http`.

## Langfuse: the LLM's-eye view

Everything above tells you what the *system* did. When the question is what the *agent* decided — wrong tool, ignored instruction, hallucinated answer — you need the trace. Testeiya can trace every run to [Langfuse](https://langfuse.com): the full prompt, each model call, every tool's arguments and result, token usage, and cost.

### Enable it

1. Get keys from [langfuse.com](https://langfuse.com) (free tier) or a self-hosted instance.
2. Seed the env file and fill in the keys:

   ```bash
   bun run setup:env        # creates ~/.testeiya/.env with a commented block
   ```

   ```bash
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   # LANGFUSE_BASE_URL=https://cloud.langfuse.com   # for self-hosted
   ```

3. Restart the app. On startup you'll see `[telemetry] Langfuse enabled → …`.

With no keys set, telemetry is a silent no-op — the agent runs exactly the same. Each prompt becomes one trace tagged `testeiya` plus the surface (`web`, `desktop`, `cli`), grouped by conversation.

### Pull a trace

Inspect traces in the Langfuse dashboard, or dump them as JSON:

```bash
cd cli
bun run debug:trace <trace-id>            # one trace (id from the Langfuse UI)
bun run debug:trace session:<conv-id>     # every prompt in one chat session
bun run debug:trace 30m | 1h | today      # recent traces by time range
# → cli/log/langfuse-trace-*.json (gitignored — holds full prompts, never commit)
```

## A worked example: tracing one prompt end to end

Here is a real session, debugged with the toolkit. The user asked:

> Which feature areas have the fewest test cases? Look at the workspace folders and give me a short top-3 list.

The agent answered with a plausible top-3. Suppose you're reviewing whether that answer can be trusted — did it actually count files, or did it guess? This is the everyday debugging question for an agent product, and it takes about two minutes to answer.

### 1. Pull the trace

```bash
$ bun run debug:trace 30m
Fetching traces from 2026-07-11T09:33:12Z to 2026-07-11T10:03:12Z
Found 2 trace(s)
  2026-07-11T09:52:49.937Z | Which feature areas have the fewest test cases? … | 8 observations
Saved to: cli/log/langfuse-trace-range-1783764192146.json
```

### 2. Read the shape of the run

List the observations in order:

```bash
jq -r '.[0].observations | sort_by(.startTime)[] | "\(.type)\t\(.name)\t\(.level)"' \
  cli/log/langfuse-trace-*.json
```

```
AGENT       Which feature areas have the fewest test cases? …   DEFAULT
GENERATION  llm-generation                                      DEFAULT
TOOL        read   (memory://root/memory_summary.md)            DEFAULT
TOOL        read   (.)                                          DEFAULT
TOOL        find   (./**/*.test.md)                             DEFAULT
GENERATION  llm-generation                                      DEFAULT
TOOL        bash   (python: count tests per folder)             DEFAULT
GENERATION  llm-generation                                      DEFAULT
```

The story is already visible: the first generation planned and recalled [project memory](../application/overview.md#settings), then listed the workspace and globbed every `*.test.md` file; the second generation wrote a Python one-liner to count cases per folder; the third produced the answer. The agent **computed** the numbers — it didn't guess. No observation has `level: "ERROR"`, so every tool call succeeded.

### 3. Verify the claims against the tool output

Two recipes answer most "can I trust this?" questions:

```bash
# what the model actually saw as input
jq '.[0].observations[] | select(.type=="GENERATION") | .input' <file>

# any failed tool calls
jq '[.[].observations[] | select(.level=="ERROR") | {name, output}]' <file>
```

Look for **mismatches**: what a generation's output *claimed* versus what the tool observation's `output` actually contained. The classic agent bug is a model asserting "I checked X" while the tool result says otherwise — the trace makes that visible in seconds.

### 4. Cross-check the system side

The same turn, seen from the debug snapshot (`bun run debug:snapshot`):

```json
"server": { "ai": [
  { "model": "gpt-5.4", "summary": "gpt-5.4 · toolUse", "durationMs": 7441,
    "tokens": { "input": 38542, "output": 190 } },
  { "model": "gpt-5.4", "summary": "gpt-5.4 · toolUse", "durationMs": 17581,
    "tokens": { "input": 42581, "output": 729 } },
  { "model": "gpt-5.4", "summary": "gpt-5.4 · stop",    "durationMs": 10840,
    "tokens": { "input": 940,   "output": 185 } }
]}
```

Three generations matching the trace, with stop reasons, latencies, and token counts. If the UI had shown a stall instead of an answer, this is where you'd see which side went quiet: an `ai` event that never finished points at the provider; a finished `ai` event with no UI update points at the WebSocket bridge or a stale client store — and `client.entries` in the same snapshot settles it.

### The takeaway

Each layer confirms the next: the **trace** shows what the agent decided, the **snapshot** shows what the system executed, `testomatio.http` shows what the API returned, and the **debug panel** shows what the user saw. When those four agree, the answer is trustworthy; when they disagree, the disagreement *is* the bug.

## The `testeiya-debug` skill

Contributors debugging Testeiya itself with an AI coding agent should use the repo's **`testeiya-debug`** skill (`.claude/skills/testeiya-debug/SKILL.md`). It automates this whole page: collects the snapshot, the Langfuse trace, and `testomatio.http`, then walks the failure across layers before proposing a fix.

## What's next

- [Build the app locally](building-locally.md)
- [Application overview](../application/overview.md#debug-panel) — the debug panel from a user's perspective.
