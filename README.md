# Testeiya App

**Testeiya** is an AI assistant for QA. Chat with it to analyze your test suites, find coverage gaps, review test quality, and create or improve test cases — across your Testomat.io projects or any local folder.

It runs **three ways** from one codebase — a **desktop app** (Windows, macOS, Linux), a **web app** in the browser, and a **terminal CLI** (`testeiya`).

![Testeiya](docs/screenshot.png)

## One repo, two packages

Testeiya ships two independently versioned packages from this single repository:

| | Location | What it is |
|---|---|---|
| **Testeiya App** | repo root (`testeiya-app`) | The chat UI and the desktop/web shell — what you see and click. Released as the desktop installers. |
| **Testeiya CLI** | [`cli/`](cli/) (`testeiya` on npm) | The agent brain (LLM, MCP servers, QA skills) plus the unified Bun app-server. Published to npm; the App imports its `app-server.ts` as the backend. |

> **Internal note:** **TestClaw** was the Agent's working codename — for internal use only. **Never use "TestClaw" in anything public.** Publicly the product is **Testeiya** (App + CLI).

The App's whole backend is the `cli/` package's `app-server.ts`, so the two are always built together.

## Quick start

Four steps to a running app. No deep technical knowledge needed — just copy each command.

### 1. Install the tools

- [Bun](https://bun.sh) 1.3.5 or newer
- [Git](https://git-scm.com)

That's all — Bun is the only runtime you need.

### 2. Get the code

```bash
git clone git@github.com:testomatio/testeiya-app.git
cd testeiya-app
```

### 3. Install

```bash
bun install                       # App deps + the cli/ package deps (via postinstall)
```

### 4. Start the app

Start with the **web app** — fastest to launch and it hot-reloads as you edit:

```bash
bun run dev              # open http://localhost:3050
```

Or run the **desktop app** (a native window):

```bash
bun run desktop:dev
```

Or the **CLI** (a terminal agent — no browser):

```bash
export OPENROUTER_API_KEY=sk-or-...   # any provider key works
cd cli && bun src/cli.ts
```

On first launch of the desktop/web app, open **Settings (⚙️)** and paste your AI provider key — Testeiya works with OpenAI, Anthropic, OpenRouter, and more. Then start chatting about your tests.

## Desktop, web, or CLI

Three ways to run Testeiya, all from this repo:

| Mode | What it is | Best for |
|---|---|---|
| **Desktop** | Native window (Electrobun) with **native filesystem access** — the in-app **Open folder** dialog points Testeiya at any directory and it reads/writes files directly. | Working against a local repo on your machine. |
| **Web** | The same chat UI in a browser. No native folder picker — give it a folder via `TESTEIYA_WORKSPACE`, or connect a Testomat.io project from the UI (which creates its own workspace). | Fast dev-loop, or embedding the UI (iframe) in Testomat.io. |
| **CLI** | A **terminal agent** (`testeiya`) — the same agent brain with no GUI, running in the current directory. | Terminal / CI workflows and quick one-off analysis. |

Desktop and Web share the exact same UI and backend (`cli/`'s `app-server.ts`); the CLI is that same agent brain driven straight from the terminal.

## Run modes

### Web app — fast dev loop (start here)

```bash
bun run dev
```

Starts the UI with hot reload at **http://localhost:3050** plus the Agent server (`:3210`). Edit the UI and the browser refreshes instantly. `/api/*` is proxied to the Agent server and the chat WebSocket connects to it directly.

### Desktop app

```bash
bun run desktop:dev      # build the static UI + launch the native window
```

Build distributable installers (macOS `.dmg`, Windows Setup `.zip`, Linux self-extracting `-Setup.tar.gz`):

```bash
bun run desktop:release  # stable build → installers in artifacts/
```

> `bun run desktop:build` is a **dev** build (`--env=dev`) used for local iteration — it
> does **not** produce installers. Use `desktop:release` for distributables.
> Electrobun builds for the **host platform only** (no cross-compile).

### CLI (terminal agent)

Run the agent straight from the terminal — no browser, no window. It works in the directory you launch it from:

```bash
export OPENROUTER_API_KEY=sk-or-...   # or any provider key you configured
cd cli && bun src/cli.ts              # or: bun run start
```

Or install it globally from npm (requires [Bun](https://bun.sh) on your PATH):

```bash
npm install -g testeiya
testeiya                              # runs in the current directory
```

See [`cli/README.md`](cli/README.md) for provider/config options.

### Releasing (GitHub Actions)

Publishing a **GitHub Release** (tag `vX.Y.Z`) triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which runs **two pipelines
in parallel**, both taking their version from the tag:

- **desktop** — builds the desktop app on Windows, macOS (arm64), and Linux runners and
  attaches the installers to the Release. Builds are **unsigned** (expect Gatekeeper /
  SmartScreen warnings on first launch).
- **publish-cli** — publishes the [`cli/`](cli/) package (`testeiya`) to npm with
  `npm publish --provenance`.

No `NPM_TOKEN` is needed: the CLI publishes via **npm Trusted Publishing** (OIDC), so the
job authenticates with the GitHub `id-token` and attaches build provenance. This requires a
one-time setup on npmjs.com — configure `testeiya` with a trusted publisher pointing at this
repo's `release.yml` workflow. The dist-tag is derived from the release tag
(`alpha`/`beta`/`rc`, or `latest` for a normal release).

### Serve the built web app (no Electrobun)

```bash
bun run build                   # static export → out/
cd cli && bun run serve:app     # serve out/ + API + WS on one port
```

## Configure with `.env`

Everything can be set in the app's **Settings**, but you can also preconfigure via a `.env` file in the project root (or `~/.testeiya/.env` for a packaged app). All keys are optional — set only what you need:

```bash
# Testomat.io API key — OPTIONAL; you can connect Testomat.io in the app
# instead. Lets Testeiya pull/push your tests.
TESTOMATIO=your-testomatio-api-key

# Testomat.io backend URL (defaults to https://app.testomat.io).
# For our staging environment, point it at beta:
#   TESTOMATIO_URL=https://beta.testomat.io
TESTOMATIO_URL=https://app.testomat.io

# AI provider key — OPTIONAL, you can set this in Settings instead.
# The variable name matches your provider: OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, ...
OPENROUTER_API_KEY=sk-or-...

# Web app only: the folder Testeiya opens as the workspace on startup
TESTEIYA_WORKSPACE=/path/to/your/tests
```

See [All environment variables](#all-environment-variables) for the full list. To create `~/.testeiya/.env` with a commented [Langfuse](#observability-langfuse) block ready to fill in, run `bun run setup:env`.

## Using the app

- **Chat** with the agent — it streams responses, shows its reasoning, and runs tools.
- **Questions:** when the agent asks something, click an option or type a reply to continue.
- **⚙️ Settings:** set your provider API key, toggle **MCP servers** on/off for the session, and **open a local folder** as the workspace.
- **Workspace:** on desktop, the folder button in the header opens any directory (native picker) so the agent works from it; the tree icon toggles the file sidebar, where you can open and edit files.
- **Theme:** the sun/moon button switches light/dark (synced across the whole UI, including the editor); the choice is remembered.

## How it works

One Bun server (`cli/src/app-server.ts`, from the CLI package) is the whole backend — it serves the UI, the HTTP API, and the agent WebSocket on a single origin:

```
┌─────────────────────────── Bun app-server (one origin) ───────────────────────────┐
│  static UI (out/)   ·   HTTP API (/api/*)   ·   agent WebSocket (chat streaming)    │
│                                   │                                                 │
│              pi-coding-agent  +  MCP servers  +  QA skills                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- **Desktop:** an Electrobun window points at the server running on a local port.
- **Web:** the same UI in a browser (or embedded as an iframe in Testomat.io).

### The Agent lives under `cli/`

The Agent (the `cli/` package — LLM wiring, MCP servers, QA skills, and the app-server) is part of this repo, so a plain `git pull` keeps it current. After pulling, refresh its dependencies:

```bash
bun install            # postinstall reinstalls the cli/ package deps too
```

## Workspaces and projects

A **workspace** is a folder on disk; a **project** is a Testomat.io project. A workspace represents a project's manual tests as `*.test.md` files. There are two ways to get one:

- **Open a project** — connect Testomat.io, pick a project, and Testeiya creates a dedicated folder for it (`~/.testeiya/workspaces/<project>/`), pulls the manual tests into it, and switches there. Switching projects switches folders.
- **Open a folder** — point Testeiya at any directory. If ~all of its files are `*.test.md` it's treated as a manual-tests project (tests at the root). Otherwise Testeiya keeps a gitignored cache at `.testeiya/manual-tests/` and shows it in the sidebar; the rest of the repo shows as folders with only `*.test.md` files visible.

The **Workspace** panel has **Pull** and **Push** buttons that run [`check-tests`](https://github.com/testomatio/check-tests) for the workspace's manual tests — pull to refresh from Testomat.io, push to upload local edits. The project token comes from your connected account (or the `TESTOMATIO` key from your `.env`).

## Starting a session from Testomat.io projects

Pull tests from one or more Testomat.io projects into a workspace and open a pre-configured session:

```bash
curl -X POST http://localhost:3050/api/agent/start \
  -H "Content-Type: application/json" \
  -d '{
    "projects": [
      { "title": "Frontend App", "slug": "frontend", "token": "your-testomatio-token" },
      { "title": "API Server", "slug": "api", "token": "another-token" }
    ]
  }'
# → { "sessionId": "a1b2c3d4-...", "projects": [ ... ] }
```

Then open `http://localhost:3050/?session=a1b2c3d4-...`. During start, a temp workspace is created, `check-tests` pulls each project's `*.test.md` files into it, an MCP server is configured per project, and the agent's system prompt is extended with that context.

Session info:

```bash
curl http://localhost:3050/api/agent/<sessionId>
```

## Configuration

### All environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TESTOMATIO` | Testomat.io API key (pull/push tests) | — (or connect Testomat.io in the app) |
| `TESTOMATIO_URL` | Testomat.io backend for pulling tests (staging: `https://beta.testomat.io`) | `https://app.testomat.io` |
| `<PROVIDER>_API_KEY` | Your LLM provider key — name matches the provider (e.g. `OPENROUTER_API_KEY`, `OPENAI_API_KEY`) | — (or set via Settings) |
| `TESTEIYA_WORKSPACE` | Web mode: folder opened automatically as the workspace on cold load | — |
| `PORT` | Port for the Bun app-server (desktop uses a random free port) | `3050` |
| `AGENT_SERVER_URL` | Where `next dev` proxies `/api/*` (web mode) | `http://localhost:3210` |
| `NEXT_PUBLIC_TESTEIYA_WS_URL` | Agent WebSocket URL — **dev only**; the production/desktop build always uses same-origin | `ws://localhost:3210` |
| `LANGFUSE_PUBLIC_KEY` · `LANGFUSE_SECRET_KEY` | Enable [Langfuse](https://langfuse.com) tracing of every agent run (both required) | — (telemetry off) |
| `LANGFUSE_BASE_URL` | Langfuse host — set for a self-hosted instance | `https://cloud.langfuse.com` |

### LLM provider

Choose your provider and model in the app's **Settings**, or set defaults in `cli/testeiya.config.json` (or `~/.testeiya/config.json`):

```json
{
  "provider": {
    "name": "openrouter",
    "baseUrl": "https://openrouter.ai/api/v1",
    "model": "anthropic/claude-sonnet-4",
    "contextWindow": 200000,
    "maxTokens": 16384
  }
}
```

### Where state is stored

| Path | Contents |
|------|----------|
| `~/.testeiya/sessions.json` | Active sessions (24h TTL) |
| `~/.testeiya/auth.json` | Provider API key (set via Settings) |
| `~/.testeiya/config.json` | Optional provider/permissions overrides |
| `~/.testeiya/workspaces/<project>/` | Persistent per-project workspace: pulled `*.test.md` + `.testeiya/` (MCP + project link) |
| `<tmp>/testeiya-<id>/` | Ephemeral multi-project import workspace (removed on session expiry) |

## Observability (Langfuse)

Testeiya can trace every agent run to [Langfuse](https://langfuse.com) — the prompt, each model call, every tool's arguments and result, token usage, and cost. It's **optional and off by default**: with no keys set, telemetry is a silent no-op and the agent runs exactly the same.

### Enable it

1. **Get keys** — sign up at [langfuse.com](https://langfuse.com) (free tier) or [self-host](https://langfuse.com/docs/deployment/self-host), then copy the **Public** and **Secret** keys from your project settings.
2. **Seed the env file** — run once to create `~/.testeiya/.env` with a commented Langfuse block:

   ```bash
   bun run setup:env
   ```

3. **Fill in the keys** — uncomment and set the values in `~/.testeiya/.env` (or your project `.env`, or export them in your shell):

   ```bash
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   # LANGFUSE_BASE_URL=https://cloud.langfuse.com   # set for a self-hosted instance
   ```

4. **Restart** the app or CLI. On startup you'll see `[telemetry] Langfuse enabled → …`. Each prompt becomes one trace, tagged `testeiya`, grouped by session.

### Debug a session

Open the trace in the Langfuse dashboard, or pull it down as JSON for inspection:

```bash
bun run debug:trace <trace-id>          # a single trace (id from the Langfuse UI)
bun run debug:trace session:<conv-id>   # every prompt in one chat session
bun run debug:trace 1h                   # recent traces (30m · 1h · today)
```

The dump lands in `cli/log/langfuse-trace-*.json` (gitignored). See **Debugging** in `CLAUDE.md` for how to read it.

### Full-stack debug snapshot

For bugs that span the UI, the server, and the REST layer (not just the LLM), the running app exposes `GET /api/debug/snapshot` — the server's Testomat.io REST + LLM events + console, merged with the browser's `/api/*` log, console errors, and MobX store snapshot. Pull it with `bun run debug:snapshot`. Contributors debugging Testeiya itself should use the **`testeiya-debug`** skill, which collects the snapshot + Langfuse trace + `testomatio.http` and walks the failure across layers.

## Tech stack

- **Next.js 16** (App Router, static export) + **Tailwind CSS v4** + **shadcn/ui / AI Elements**
- **Bun** server (`Bun.serve` for UI + API + WebSocket)
- **Electrobun** for the cross-platform desktop shell
- **pi-coding-agent** SDK (the Agent), **@testomatio/mcp** (MCP), QA **skills** vendored from GitHub into `cli/skills` (see `cli/skills.yaml`), **check-tests** (Testomat.io sync)

## Ports

Use 3050+ for dev servers — never 3000. Web dev: UI `3050`, agent server `3210`. The desktop app picks a random free port.
