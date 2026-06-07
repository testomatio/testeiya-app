# Testeiya App

An AI-powered QA testing agent. Chat with Testeiya to analyze test suites, find coverage gaps, review test quality, and create/improve test cases across your Testomat.io projects or any local folder.

Testeiya runs as a **cross-platform desktop app** (built with [Electrobun](https://github.com/blackboardsh/electrobun)) and as a **web app** from the same codebase.

> **This repo is the Testeiya App** — the chat UI and the desktop/web shell. The **terminal agent backend lives in a separate repo** ([`testomatio/testclaw`](https://github.com/testomatio/testclaw)) and is included here as the **`testeiya/` git submodule**. You must initialize the submodule before building (see [Install](#install)).

## How it works

One Bun server (`testeiya/src/app-server.ts`, from the submodule) is the whole backend — it serves the UI, the HTTP API, and the agent WebSocket on a single origin:

```
┌─────────────────────────── Bun app-server (one origin) ───────────────────────────┐
│  static UI (out/)   ·   HTTP API (/api/*)   ·   agent WebSocket (chat streaming)    │
│                                   │                                                 │
│              pi-coding-agent  +  MCP servers  +  QA skills                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- **Desktop:** an Electrobun window points at the server running on a local port.
- **Web:** the same UI in a browser (or embedded as an iframe in Testomat.io).

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3.5 and Node.js ≥ 22
- An OpenRouter API key (or another provider configured in `testeiya/testeiya.config.json` / `~/.testeiya/config.json`)
- Desktop builds: macOS 14+, Windows 11+, or Linux (Ubuntu 22.04+ / `webkit2gtk-4.1`)

## Install

Clone with the `testeiya/` submodule (the agent backend, repo [`testomatio/testclaw`](https://github.com/testomatio/testclaw)):

```bash
git clone --recursive git@github.com:testomatio/testeiya-app.git
cd testeiya-app
```

Already cloned without `--recursive`? Pull the submodule in:

```bash
git submodule update --init --recursive
```

Then install dependencies for both the app and the submodule:

```bash
npm install
cd testeiya && bun install && cd ..
```

> Updating the agent backend later: `git submodule update --remote testeiya` pulls the latest commit from `testomatio/testclaw`; commit the bumped submodule pointer here to record it.

## Set your API key

Any one of these works (checked in this order):

1. **Environment:** `export OPENROUTER_API_KEY=sk-or-...`
2. **`.env` file:** put `OPENROUTER_API_KEY=sk-or-...` in `.env` or `testeiya/.env` (auto-loaded in dev; for a packaged app use `~/.testeiya/.env`).
3. **In-app Settings:** launch the app, click the ⚙️ gear, paste your key. It's stored in `~/.testeiya/auth.json`.

If no key is set, the chat shows a clear error with an **Open Settings** button.

## Run

### Fast web dev loop (recommended for development)

```bash
npm run dev
```

Starts `next dev` (UI with hot reload at **http://localhost:3050**) plus the Bun agent server (`:3210`). Edit the UI and the browser refreshes instantly — no rebuild, no desktop bundling. `/api/*` is proxied to the agent server and the chat WebSocket connects to it directly.

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

## Using the app

- **Chat** with the agent — it streams responses, shows reasoning, and runs tools.
- **Questions:** when the agent asks, click an option or type a reply to continue.
- **⚙️ Settings:** set your provider API key, toggle **MCP servers** on/off for the session, and **open a local folder** as the workspace.
- **Workspace:** the folder button in the header opens any directory (native picker on desktop) so the agent works from it; the tree icon toggles the file sidebar, where you can open and edit files.
- **Theme:** the sun/moon button switches light/dark (synced across the whole UI, including the editor); the choice is remembered.

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
| `OPENROUTER_API_KEY` | LLM provider API key (env var name derives from the provider) | — (or set via Settings) |
| `TESTOMATIO_URL` | Testomat.io backend for pulling tests | `https://app.testomat.io` |
| `TESTEIYA_WORKSPACE` | Web mode: folder opened automatically as the workspace on cold load | — |
| `PORT` | Port for the Bun app-server (desktop uses a random free port) | `3050` |
| `AGENT_SERVER_URL` | Where `next dev` proxies `/api/*` (web mode) | `http://localhost:3210` |
| `NEXT_PUBLIC_TESTEIYA_WS_URL` | Agent WebSocket URL — **dev only**; the production/desktop build always uses same-origin | `ws://localhost:3210` |

### LLM provider

Set in `testeiya/testeiya.config.json` (or `~/.testeiya/config.json`):

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
- **pi-coding-agent** SDK (the agent), **@testomatio/mcp** (MCP), **@testomatio/skills** (QA skills), **check-tests** (Testomat.io sync)

## Ports

Use 3050+ for dev servers — never 3000. Web dev: UI `3050`, agent server `3210`. The desktop app picks a random free port.
