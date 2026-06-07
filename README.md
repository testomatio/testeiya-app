# Testeiya App

**Testeiya** is an AI assistant for QA. Chat with it to analyze your test suites, find coverage gaps, review test quality, and create or improve test cases — across your Testomat.io projects or any local folder.

It runs as a **desktop app** (Windows, macOS, Linux) and as a **web app** from the same codebase.

![Testeiya](docs/screenshot.png)

## Two repos: the App and the Agent

Testeiya is split into two repositories:

| | Repo | What it is |
|---|---|---|
| **Testeiya App** | this repo (`testomatio/testeiya-app`) | The chat UI and the desktop/web shell — what you see and click. |
| **Testeiya Agent** | [`testomatio/testclaw`](https://github.com/testomatio/testclaw) | The agent brain (LLM, MCP servers, QA skills). Lives here as the `testeiya/` **git submodule**. |

> **Internal note:** **TestClaw** is the Agent's working codename — for internal use only. **Never use "TestClaw" in anything public.** Publicly the product is **Testeiya** (App + Agent).

The App can't run without the Agent, so the steps below pull both for you.

## Quick start

Five steps to a running app. No deep technical knowledge needed — just copy each command.

### 1. Install the tools

- [Node.js](https://nodejs.org) 22 or newer
- [Bun](https://bun.sh) 1.3.5 or newer
- [Git](https://git-scm.com)

### 2. Get the code

Clone with `--recursive` so the Agent comes along:

```bash
git clone --recursive git@github.com:testomatio/testeiya-app.git
cd testeiya-app
```

*(Forgot `--recursive`? Just run `npm install` in step 3 — it pulls the Agent for you.)*

### 3. Install

```bash
npm install                       # also fetches the Agent (submodule) automatically
cd testeiya && bun install && cd ..
```

### 4. Add your AI provider key

Testeiya works with **many LLM providers** — OpenAI, Anthropic, OpenRouter, and more. Pick yours in **Settings** inside the app and paste the key (stored in `~/.testeiya/auth.json`). You can also set it as an environment variable before starting — see [Set your API key](#set-your-api-key).

If no key is set, the chat shows a clear message with an **Open Settings** button.

### 5. Start the app

```bash
npm run desktop:dev      # opens the native desktop window
```

Prefer the browser with instant hot-reload while developing?

```bash
npm run dev              # open http://localhost:3050
```

That's it — start chatting with Testeiya about your tests.

## Using the app

- **Chat** with the agent — it streams responses, shows its reasoning, and runs tools.
- **Questions:** when the agent asks something, click an option or type a reply to continue.
- **⚙️ Settings:** set your provider API key, toggle **MCP servers** on/off for the session, and **open a local folder** as the workspace.
- **Workspace:** the folder button in the header opens any directory (native picker on desktop) so the agent works from it; the tree icon toggles the file sidebar, where you can open and edit files.
- **Theme:** the sun/moon button switches light/dark (synced across the whole UI, including the editor); the choice is remembered.

## Set your API key

Any one of these works (checked in this order). The env var name matches your provider — e.g. `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`:

1. **Environment:** `export OPENROUTER_API_KEY=...`
2. **`.env` file:** put `OPENROUTER_API_KEY=...` in `.env` or `testeiya/.env` (auto-loaded in dev; for a packaged app use `~/.testeiya/.env`).
3. **In-app Settings:** launch the app, click the ⚙️ gear, paste your key.

## Run modes

### Fast web dev loop (recommended while developing)

```bash
npm run dev
```

Starts `next dev` (UI with hot reload at **http://localhost:3050**) plus the Agent server (`:3210`). Edit the UI and the browser refreshes instantly — no rebuild. `/api/*` is proxied to the Agent server and the chat WebSocket connects to it directly.

### Desktop app

```bash
npm run desktop:dev      # build the static UI + launch the native window
```

To produce distributable installers (DMG / Setup.exe / AppImage etc.):

```bash
npm run desktop:build    # artifacts land in build/
```

### Serve the built web app (no Electrobun)

```bash
npm run build                       # static export → out/
cd testeiya && npm run serve:app    # serve out/ + API + WS on one port
```

## How it works

One Bun server (`testeiya/src/app-server.ts`, from the Agent submodule) is the whole backend — it serves the UI, the HTTP API, and the agent WebSocket on a single origin:

```
┌─────────────────────────── Bun app-server (one origin) ───────────────────────────┐
│  static UI (out/)   ·   HTTP API (/api/*)   ·   agent WebSocket (chat streaming)    │
│                                   │                                                 │
│              pi-coding-agent  +  MCP servers  +  QA skills                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- **Desktop:** an Electrobun window points at the server running on a local port.
- **Web:** the same UI in a browser (or embedded as an iframe in Testomat.io).

### Updating the Agent

The Agent is pinned to a specific commit. To move it forward:

```bash
git submodule update --remote testeiya   # pull the latest Agent from testomatio/testclaw
git add testeiya && git commit -m "chore: bump Testeiya Agent"
```

## Workspaces and projects

A **workspace** is a folder on disk; a **project** is a Testomat.io project. A workspace represents a project's manual tests as `*.test.md` files. There are two ways to get one:

- **Open a project** — connect Testomat.io, pick a project, and Testeiya creates a dedicated folder for it (`~/.testeiya/workspaces/<project>/`), pulls the manual tests into it, and switches there. Switching projects switches folders.
- **Open a folder** — point Testeiya at any directory. If ~all of its files are `*.test.md` it's treated as a manual-tests project (tests at the root). Otherwise Testeiya keeps a gitignored cache at `.testeiya/manual-tests/` and shows it in the sidebar; the rest of the repo shows as folders with only `*.test.md` files visible.

The **Workspace** panel has **Pull** and **Push** buttons that run [`check-tests`](https://github.com/testomatio/check-tests) for the workspace's manual tests — pull to refresh from Testomat.io, push to upload local edits. The project token comes from your connected account (or the folder's own `.env` `TESTOMATIO=`).

In **web mode** (no native folder picker), set `TESTEIYA_WORKSPACE=/path/to/folder` before starting the server and Testeiya opens it automatically.

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

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `<PROVIDER>_API_KEY` | Your LLM provider key — name matches the provider (e.g. `OPENROUTER_API_KEY`, `OPENAI_API_KEY`) | — (or set via Settings) |
| `TESTOMATIO_URL` | Testomat.io backend for pulling tests | `https://app.testomat.io` |
| `TESTEIYA_WORKSPACE` | Web mode: folder opened automatically as the workspace on cold load | — |
| `PORT` | Port for the Bun app-server (desktop uses a random free port) | `3050` |
| `AGENT_SERVER_URL` | Where `next dev` proxies `/api/*` (web mode) | `http://localhost:3210` |
| `NEXT_PUBLIC_TESTEIYA_WS_URL` | Agent WebSocket URL — **dev only**; the production/desktop build always uses same-origin | `ws://localhost:3210` |

### LLM provider

Choose your provider and model in the app's **Settings**, or set defaults in `testeiya/testeiya.config.json` (or `~/.testeiya/config.json`):

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

## Tech stack

- **Next.js 16** (App Router, static export) + **Tailwind CSS v4** + **shadcn/ui / AI Elements**
- **Bun** server (`Bun.serve` for UI + API + WebSocket)
- **Electrobun** for the cross-platform desktop shell
- **pi-coding-agent** SDK (the Agent), **@testomatio/mcp** (MCP), **@testomatio/skills** (QA skills), **check-tests** (Testomat.io sync)

## Ports

Use 3050+ for dev servers — never 3000. Web dev: UI `3050`, agent server `3210`. The desktop app picks a random free port.
