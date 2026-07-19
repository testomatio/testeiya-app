# Build the app locally

One repo ships two packages: the **Testeiya App** (the chat UI and desktop/web shell, at the repo root) and the **Testeiya CLI** (`cli/` — the agent brain plus the unified Bun app-server, published to npm as `testeiya`). The app's whole backend is the CLI package's `app-server.ts`, so the two always build together.

## Prerequisites

- [Bun](https://bun.sh) 1.3.5 or newer
- [Git](https://git-scm.com)

Bun is the only runtime you need.

## Get the code and install

```bash
git clone git@github.com:testomatio/testeiya-app.git
cd testeiya-app
bun install          # installs app deps + the cli/ package deps (via postinstall)
```

## Run modes

| Command | What it does | Use for |
|---|---|---|
| `bun run dev` | UI with hot reload at `:3050` + agent server at `:3210` | Day-to-day UI and feature work |
| `bun run desktop:dev` | Builds the static UI, opens the native Electrobun window | Testing the real desktop shell |
| `bun run desktop:release` | Stable desktop build → installers in `artifacts/` | Shipping the desktop app |
| `cd cli && bun src/cli.ts` | The terminal CLI agent (no UI, no server) | Terminal / CI agent work |
| `bun run storybook` | Storybook on `:6006` | Browsing component stories |

Start with the web app — it's the fastest loop:

```bash
bun run dev          # open http://localhost:3050
```

`next dev` serves the UI with hot reload and proxies `/api/*` to the Bun agent server; the chat WebSocket connects to it directly. On first launch, set a provider key in the app's Settings (or via `.env`, below).

> [!NOTE]
> `bun run desktop:build` is a dev build — it does **not** produce installers. Use `desktop:release` for distributables. Electrobun builds for the host platform only (no cross-compiling).

To serve the production web bundle without Electrobun:

```bash
bun run build                  # static export → out/
cd cli && bun run serve:app    # UI + API + WebSocket on one port
```

## How it fits together

One Bun server (`cli/src/app-server.ts`) is the entire backend — it serves the static UI, the HTTP API (`/api/*`), and the agent WebSocket on a single origin:

```
Bun app-server (one origin)
 ├─ static UI          out/ (next export)
 ├─ HTTP API           /api/* → cli/src/api/*.ts
 └─ WS upgrade         agent stream → cli/src/connection.ts
        └─ agent session + MCP servers + QA skills
```

- **Desktop:** the Electrobun main process boots the app-server on a random free localhost port and opens a native window at it.
- **Web dev:** `next dev` proxies to the agent server so you get hot reload.

## Configure with `.env`

Everything can be set in the app's Settings, but a `.env` in the project root (or `~/.testeiya/.env` for a packaged app) also works. All keys are optional:

```bash
# Testomat.io API key — or connect your account in the app instead
TESTOMATIO=your-testomatio-api-key

# Testomat.io backend (staging: https://beta.testomat.io)
TESTOMATIO_URL=https://app.testomat.io

# AI provider key — the name matches the provider
OPENROUTER_API_KEY=sk-or-...

# Web app only: folder opened as the workspace on startup
TESTEIYA_WORKSPACE=/path/to/your/tests

# Langfuse tracing (both keys required to enable) — see the Debugging page
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

Run `bun run setup:env` once to create `~/.testeiya/.env` with a commented template.

## Ports

Dev servers use **3050** (web UI) and **3210** (agent server); the desktop app picks a random free port. Never use 3000.

## Bundled skills

The skills tree `cli/skills/` is organized by vendor folder. External vendors come from GitHub repos listed in `cli/skills.yaml` (pinned in `cli/skills.lock.json`); folders the manifest does not own — like `cli/skills/testeiya/` — hold Testeiya's own first-party skills and are never touched by updates. To update or add external skills, edit the manifest and run:

```bash
bunosh skills:update             # refresh every external vendor's folder
bunosh skills:update codeceptjs  # refresh a single vendor
bunosh skills:create my-skill    # scaffold an internal skill in cli/skills/testeiya/
bunosh skills:list               # list the skills tree by vendor
```

Release CI re-runs the update step, so shipped external skills are always current.

## Releasing

Publishing a GitHub Release (tag `vX.Y.Z`) triggers two parallel pipelines, both versioned from the tag:

- **desktop** — builds installers on Windows, macOS (arm64), and Linux runners and attaches them to the release.
- **publish-cli** — publishes `cli/` to npm as `testeiya` via npm Trusted Publishing (OIDC, with provenance). Pre-release tags (`alpha`/`beta`/`rc`) map to matching npm dist-tags.

## What's next

- [Storybook](storybook.md) — the component catalog.
- [Debugging Testeiya](debugging.md) — the debug toolkit for when something misbehaves.
