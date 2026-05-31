@AGENTS.md

# TestClaw Agent

TestClaw is an AI-powered QA agent (chat UI + agent backend). It ships two ways from one codebase:

- **Desktop app** — packaged with [Electrobun](https://github.com/blackboardsh/electrobun) (Bun-based, system webview).
- **Web app** — the same UI served in a browser (and embeddable as an iframe in the Testomat.io product).

## Architecture (read this first)

Everything is served by **one unified Bun server** — `testclaw/src/app-server.ts`. A single `Bun.serve()` on one origin:

1. serves the statically-exported Next.js UI (`out/`),
2. hosts the HTTP API (`/api/*`),
3. upgrades the agent **WebSocket** (the streaming chat protocol).

```
Bun app-server (testclaw/src/app-server.ts) — one origin
 ├─ static UI            out/ (next export)
 ├─ HTTP API             /api/* → testclaw/src/api/*.ts
 └─ WS upgrade           agent stream → testclaw/src/connection.ts
        │
        └─ pi-coding-agent session (testclaw/src/session-factory.ts) + MCP + skills
state: ~/.testclaw/{sessions.json, auth.json, config.json}, os.tmpdir()/testclaw-*
```

- **Desktop:** `src/bun/index.ts` (Electrobun main process) boots the app-server on a **random free localhost port** and opens a `BrowserWindow` at it. Bundling is controlled by `electrobun.config.ts`.
- **Web dev:** `next dev` serves the UI with hot reload and **proxies `/api/*`** to the Bun agent server (see `next.config.ts` rewrites); the WebSocket connects to the agent server directly.
- Because the production build is one origin, the UI uses **same-origin** relative `fetch("/api/...")` and a same-origin WebSocket. In `next dev` the WS uses `NEXT_PUBLIC_TESTCLAW_WS_URL` instead (cross-origin to the agent server).

> History: the API used to be Next.js route handlers under `app/api`. Those were ported to `testclaw/src/api/*.ts` and `app/api` was removed so the UI can be statically exported (`output: "export"`). Don't reintroduce route handlers — add API endpoints to the Bun server instead.

## Run modes

| Command | What it does | Use for |
|---|---|---|
| `npm run web` | `next dev` (UI :3050, **hot reload**) + Bun agent server (:3210); `/api` proxied, WS direct | **Fast day-to-day UI/feature work** |
| `npm run desktop:dev` | `NEXT_EXPORT=1 next build` → `electrobun dev` (native window) | Testing the real desktop shell |
| `npm run desktop:build` | `NEXT_EXPORT=1 next build` → `electrobun build` (installers) | Shipping |
| `npm run app:serve` | Just the unified Bun server (serves prebuilt `out/`) | Serving an export without Electrobun |
| `npm run app:build` | `NEXT_EXPORT=1 next build` → `out/` | Produce the static UI |

`next.config.ts` is **dual-mode**: `NEXT_EXPORT=1` → `output: "export"` (no rewrites/headers, which export forbids); unset → `next dev` with the `/api` proxy. Desktop scripts set `NEXT_EXPORT=1`.

## API key resolution

The agent needs an LLM provider key (default provider `openrouter` → `OPENROUTER_API_KEY`). Resolved in this order (handled by `testclaw/src/session-factory.ts` via the SDK's `AuthStorage`):

1. **Process env** (exported `OPENROUTER_API_KEY`).
2. **`.env` files** auto-loaded by `testclaw/src/load-env.ts` — `~/.testclaw/.env`, then walking up from the bundle to the project's `.env` / `testclaw/.env` (this is what makes a dev `.env` work inside the Electrobun app, whose CWD isn't the project).
3. **In-app Settings UI** → persisted to `~/.testclaw/auth.json`.

In a **packaged** install there's no project `.env` up the tree, so the user supplies the key via Settings (or `~/.testclaw/.env`). Missing key → the agent throws and the UI shows a red banner with an "Open Settings" button.

## HTTP API (served by the Bun app-server)

| Route | Method | Purpose |
|---|---|---|
| `/api/agent/start` | POST | Pull projects from Testomat.io into a temp workspace, write MCP config, create a session |
| `/api/agent/:sessionId` | GET | Session metadata |
| `/api/files/read` · `/api/files/tree` · `/api/files/write` | GET/GET/POST | Workspace file editor (path-sandboxed) |
| `/api/testomatio/:resource` | GET | Read-only proxy to Testomat.io v2 REST (SSRF-guarded whitelist) |
| `/api/settings` | GET/POST | Report whether a key is configured / save the provider API key |
| `/api/mcp` | GET/POST | List MCP servers for a session / enable-disable each |
| `/api/workspace` · `/api/workspace/pick` | POST | Open a local dir as the workspace / native folder picker (Electrobun) |

## WebSocket protocol (`hooks/use-testclaw.ts` ↔ `testclaw/src/connection.ts`)

Client → server: `{type:"prompt", message, ...params}`, `{type:"abort"}`, `{type:"new_session"}`.
Server → client: `session_created`, `start`, `text-start|delta|end`, `reasoning-start|delta|end`, `tool-input-available`, `tool-output-available`, `finish`, `done`, `error`, `session_cleared`.

The hook has a **stall watchdog**: if no event arrives for 45s after a send it surfaces a visible error (no more silent "nothing happened"). The agent session is created on the first prompt of a connection.

## Key files

**Frontend**
- `app/page.tsx` — main chat page + header (workspace toggle, workspace-open, theme toggle, Clear, Settings) + error banner
- `app/layout.tsx` — providers + anti-FOUC theme script
- `hooks/use-testclaw.ts` — WS hook: connection, streaming, tool calls, error state, watchdog, dev-vs-prod WS URL
- `lib/theme.tsx` — single source of truth for light/dark (`useTheme`); applies `.dark`/`.light`, persists, follows host when embedded
- `lib/host-bridge.tsx` — iframe-embed context (host theme/JWT via postMessage)
- `lib/workspace/WorkspaceContext.tsx`, `lib/workspace/open-workspace.ts` — workspace sidebar + open-folder flow
- `components/SettingsDialog.tsx` — provider key + MCP toggles + workspace section
- `components/workspace/MarkdownEditor.tsx` — file editor (theme-synced)
- `components/themed-toaster.tsx` — theme-bound sonner toasts
- `components/ai-elements/` — chat UI primitives

**Backend (`testclaw/src/`)**
- `app-server.ts` — unified Bun server (static + API router + WS upgrade); `startAppServer({port, staticDir})`
- `connection.ts` — per-WebSocket agent driver (transport-agnostic; reused by `server.ts`)
- `server.ts` — legacy standalone WS-only server (`ws://localhost:3210`), still works for old flows
- `session-factory.ts` — builds the pi-coding-agent session, system prompt, skills, MCP; resolves the API key
- `session-store.ts` — file-based session store (`~/.testclaw/sessions.json`, 24h TTL)
- `load-env.ts` — `.env` loader for the bundled app
- `api/*.ts` — ported HTTP handlers (framework-agnostic `(req) => Response`)
- `bridge.ts` — maps pi-coding-agent events → WS messages

**Desktop**
- `src/bun/index.ts` — Electrobun main entry (boots server, opens window)
- `electrobun.config.ts` — app metadata, `build.bun.external` (heavy agent deps kept external), `copy` (ships `out/` + runtime `node_modules`)
- `next.config.ts` — dual-mode export/dev config

## On-disk state

- `~/.testclaw/sessions.json` — active sessions (cwd, projects, tokens, 24h TTL)
- `~/.testclaw/auth.json` — provider key (SQLite-backed via AuthStorage)
- `~/.testclaw/config.json` — optional provider/permissions override (else defaults; provider `openrouter`, model from config)
- `os.tmpdir()/testclaw-<uuid>/` — per-session workspace: pulled `*.test.md` files + `.testclaw/mcp.json` (+ `mcp.all.json` / `mcp.disabled.json` for toggles). The project config dir name (`.testclaw`) is centralized in `testclaw/src/project-dir.ts` — the SDK reads MCP/skills/rules from here (see the monkey-patch in `session-factory.ts`), so anything that *writes* MCP config must use the same dir.

## Branding / design system

The brand is **neutral grays + indigo only**, font **THICCCBOI**, light/dark themes. It's wired through the theme variables so it propagates to all shadcn components — don't hardcode colors.

- **Font:** THICCCBOI (self-hosted `@font-face` in `app/globals.css`, files in `public/fonts/`). Set as `--font-sans`/`--font-heading`. JetBrains Mono (`--font-mono`) is kept for code blocks. **Never use italic** — emphasize with color/weight/gradient.
- **Palette:** the `:root` / `.dark` blocks in `app/globals.css` map shadcn tokens to the brand hex — `--primary` = indigo-500 `#6366f1`, neutral surfaces (`#ffffff`/`#fafafa`/`#f5f5f5` light, `#0a0a0a`/`#171717`/`#262626` dark), neutral borders/text. Only `--destructive` (red) and the `--status-*`/`--run-*`/`--type-*` vars stay non-brand (functional status indicators). No `gray`/`zinc`/`slate`/`stone`; no hues other than indigo for accents.
- **Headings:** compact scale in `@layer base` — H1 `text-2xl` (24px) → H6 `text-sm` (14px, the indigo uppercase "eyebrow"). Element defaults only; explicit `text-*` utilities still win.
- To restyle, edit the variables/`@layer base` in `globals.css` — components inherit automatically.

## Conventions

- **Ports:** 3050 (web UI dev), 3210 (agent server dev); desktop uses a random free port. Never 3000.
- **Bundling caveat:** the agent SDK's transitive tree can't be fully static-bundled (e.g. `mupdf` top-level await), so `electrobun.config.ts` keeps those deps `external` and ships `testclaw/node_modules` via `copy`. Validate MCP subprocess launch inside a real `electrobun build`.
- **Editing comments in `.ts` configs:** avoid `*/` inside block comments (e.g. write `skills/<name>/SKILL.md`, not `skills/*/SKILL.md`) — it terminates the comment and breaks `electrobun.config.ts` parsing.
- Legacy `next start` / `start:prod` don't work with `output: "export"`; use `app:serve` or the desktop build.
