@AGENTS.md

# Testeiya Agent

Testeiya is an AI-powered QA agent (chat UI + agent backend). It ships two ways from one codebase:

- **Desktop app** — packaged with [Electrobun](https://github.com/blackboardsh/electrobun) (Bun-based, system webview).
- **Web app** — the same UI served in a browser (and embeddable as an iframe in the Testomat.io product).

## Architecture (read this first)

Everything is served by **one unified Bun server** — `testeiya/src/app-server.ts`. A single `Bun.serve()` on one origin:

1. serves the statically-exported Next.js UI (`out/`),
2. hosts the HTTP API (`/api/*`),
3. upgrades the agent **WebSocket** (the streaming chat protocol).

```
Bun app-server (testeiya/src/app-server.ts) — one origin
 ├─ static UI            out/ (next export)
 ├─ HTTP API             /api/* → testeiya/src/api/*.ts
 └─ WS upgrade           agent stream → testeiya/src/connection.ts
        │
        └─ pi-coding-agent session (testeiya/src/session-factory.ts) + MCP + skills
state: ~/.testeiya/{sessions.json, auth.json, config.json}, os.tmpdir()/testeiya-*
```

- **Desktop:** `src/bun/index.ts` (Electrobun main process) boots the app-server on a **random free localhost port** and opens a `BrowserWindow` at it. Bundling is controlled by `electrobun.config.ts`.
- **Web dev:** `next dev` serves the UI with hot reload and **proxies `/api/*`** to the Bun agent server (see `next.config.ts` rewrites); the WebSocket connects to the agent server directly.
- Because the production build is one origin, the UI uses **same-origin** relative `fetch("/api/...")` and a same-origin WebSocket. In `next dev` the WS uses `NEXT_PUBLIC_TESTEIYA_WS_URL` instead (cross-origin to the agent server).

> History: the API used to be Next.js route handlers under `app/api`. Those were ported to `testeiya/src/api/*.ts` and `app/api` was removed so the UI can be statically exported (`output: "export"`). Don't reintroduce route handlers — add API endpoints to the Bun server instead.

## Run modes

| Command | What it does | Use for |
|---|---|---|
| `npm run dev` | `next dev` (UI :3050, **hot reload**) + the unified `app-server.ts` on :3210 (`/api/*` + WS); `/api` proxied, WS direct | **Fast day-to-day UI/feature work** |
| `npm run build` | `NEXT_EXPORT=1 next build` → static UI in `out/` | Produce the static UI (serve with `cd testeiya && npm run serve:app`) |
| `npm run desktop:dev` | `NEXT_EXPORT=1 next build` → `electrobun dev` (native window) | Testing the real desktop shell |
| `npm run desktop:build` | `NEXT_EXPORT=1 next build` → `electrobun build` (installers) | Shipping |

> The agent server **must** be `app-server.ts` (`testeiya`'s `serve:app`) — it serves `/api/*` + the WS upgrade. The old `server.ts` was WS-only and answered every REST call with `426 Upgrade Required`; its `serve` script has been removed. `npm run dev` wires the correct pair.

`next.config.ts` is **dual-mode**: `NEXT_EXPORT=1` → `output: "export"` (no rewrites/headers, which export forbids); unset → `next dev` with the `/api` proxy. Desktop scripts set `NEXT_EXPORT=1`.

## API key resolution

The agent needs an LLM provider key (default provider `openrouter` → `OPENROUTER_API_KEY`). Resolved in this order (handled by `testeiya/src/session-factory.ts` via the SDK's `AuthStorage`):

1. **Process env** (exported `OPENROUTER_API_KEY`).
2. **`.env` files** auto-loaded by `testeiya/src/load-env.ts` — `~/.testeiya/.env`, then walking up from the bundle to the project's `.env` / `testeiya/.env` (this is what makes a dev `.env` work inside the Electrobun app, whose CWD isn't the project).
3. **In-app Settings UI** → persisted to `~/.testeiya/auth.json`.

In a **packaged** install there's no project `.env` up the tree, so the user supplies the key via Settings (or `~/.testeiya/.env`). Missing key → the agent throws and the UI shows a red banner with an "Open Settings" button.

## Workspace ↔ Project model

This is the core domain model — read it before touching the workspace/sidebar/sync code.

- **Workspace = the current working directory** (a session's `cwd`). Desktop picks it (the native folder picker, or a per-project dir); **web mode** supplies it via the `TESTEIYA_WORKSPACE` env var (`GET /api/workspace/default` opens it on cold load).
- **Project = a Testomat.io project** fetched via API. A workspace *represents* a project on the filesystem. The client-side `ProjectService`/`WorkspaceService` (`lib/services/`) are the business-logic home; sections/dialogs are thin `observer` views.

**Two workspace shapes:**
- **Managed project workspace** — opening a project creates `~/.testeiya/workspaces/<safe-project-id>/` (`projectWorkspaceDir`, `agent-start.ts`), pulls its manual tests to the **root** (a manual-tests-only folder), and writes `.testeiya/testeiya.json` `{projectId, baseUrl, title}` + `.testeiya/mcp.json`. Switching projects switches folders.
- **Arbitrary folder** — the user opens their own dir. It's classified by `resolveManualTestsDir(cwd)` in `testeiya/src/workspace-model.ts`:
  1. `.testeiya/manual-tests/` exists & non-empty → that's the manual-tests source (tests overlaid onto a code repo; gitignored via `.testeiya/.gitignore`);
  2. else ≥ **90%** of files (recursive, minus `VENDOR_DIRS`) are `*.test.md` → the **root** is the source (`isProject`);
  3. else `null` — nothing loaded; a pull seeds `.testeiya/manual-tests/`.

**Sidebar tree** (`GET /api/files/tree`, `files-tree.ts`): all non-vendor, non-dot **folders** are shown; **only `*.test.md` files** outside the manual-tests dir; **all files** inside it (and the dir is auto-expanded, even when it lives under `.testeiya/`). The response carries `{ manualTestsDir, isProject, project }`.

**Sync** (`POST /api/workspace/sync` `{session, action}`): runs `check-tests` (`testeiya/src/check-tests.ts`, `npx check-tests[@latest] pull|push -d <dir>`) for the resolved manual-tests dir. Token resolution: a managed session's `tokens[slug]` → else the linked project's `apiKey` via the connected account (`.testeiya/testeiya.json` + `loadStoredAuth`) → else the folder's own `.env` `TESTOMATIO`. The Workspace sidebar section has Pull/Push buttons (`WorkspaceService.sync`). Sync semantics follow `@testomatio/skills/skills/sync-cases/SKILL.md`.

> Session expiry (`session-store.ts`) only deletes **`os.tmpdir()`** workspaces — persistent `~/.testeiya/workspaces` dirs and folders the user opened are never removed on TTL.

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
| `/api/workspace/default` | GET | Web-mode default workspace from `TESTEIYA_WORKSPACE` (reuses a live session for the same dir) |
| `/api/workspace/sync` | POST | Run `check-tests pull`/`push` for the workspace's manual tests |

## WebSocket protocol (`hooks/use-testeiya.ts` ↔ `testeiya/src/connection.ts`)

Client → server: `{type:"prompt", message, ...params}`, `{type:"abort"}`, `{type:"new_session"}`.
Server → client: `session_created`, `start`, `text-start|delta|end`, `reasoning-start|delta|end`, `tool-input-available`, `tool-output-available`, `finish`, `done`, `error`, `session_cleared`.

The hook has a **stall watchdog**: if no event arrives for 45s after a send it surfaces a visible error (no more silent "nothing happened"). The agent session is created on the first prompt of a connection.

## Verifying the Testomat.io REST API

**When you need to check how the Testomat.io REST API actually behaves** — real URLs, query params, status codes, or response shapes — **read `testeiya/log/testomatio.http`** instead of guessing. While debug mode is on, every outbound Testomat.io call (the v2 proxy, attachment upload, transcription) is appended there as a re-runnable `.http` block with the **response captured as trailing `#` comments** (see `testeiya/src/debug-bus.ts`).

- **Populated when debug mode is on:** the sidebar Debug panel is open (an `/api/debug/stream` SSE subscriber is connected) **or** the server runs with `TESTEIYA_DEBUG=1`. To capture a specific call, turn the panel on (or set the env var) and trigger it from the UI.
- The file is **gitignored** (`log/` in the submodule), append-only, and re-runnable in the VS Code REST Client / JetBrains HTTP client.
- It contains the live `Authorization: Bearer` token — treat it as a credential; never commit or paste it.

## Key files

**Frontend**
- `app/page.tsx` — main chat page + header (workspace toggle, workspace-open, theme toggle, Clear, Settings) + error banner
- `app/layout.tsx` — providers + anti-FOUC theme script
- `hooks/use-testeiya.ts` — WS hook: connection, streaming, tool calls, error state, watchdog, dev-vs-prod WS URL
- `lib/theme.tsx` — single source of truth for light/dark (`useTheme`); applies `.dark`/`.light`, persists, follows host when embedded
- `lib/host-bridge.tsx` — iframe-embed context (host theme/JWT via postMessage)
- `lib/services/` — MobX service layer (business logic): `WorkspaceService` (tree load, classification, `sync(pull|push)`, `openDefault`), `ProjectService`, `ConnectionsService`, `ProvidersService`; consumed via `useXService()` from `observer` views
- `components/panel/sections/WorkspaceSection.tsx` — file tree + Open-folder / Pull / Push / Refresh actions (thin `observer` over `WorkspaceService`)
- `components/SettingsDialog.tsx` — provider key + MCP toggles + workspace section
- `components/workspace/MarkdownEditor.tsx` — file editor (theme-synced)
- `components/themed-toaster.tsx` — theme-bound sonner toasts
- `components/ai-elements/` — chat UI primitives

**Backend (`testeiya/src/`)**
- `app-server.ts` — unified Bun server (static + API router + WS upgrade); `startAppServer({port, staticDir})`
- `connection.ts` — per-WebSocket agent driver (transport-agnostic; reused by `server.ts`)
- `server.ts` — legacy standalone WS-only server (`ws://localhost:3210`), still works for old flows
- `session-factory.ts` — builds the pi-coding-agent session, system prompt, skills, MCP; resolves the API key
- `session-store.ts` — file-based session store (`~/.testeiya/sessions.json`, 24h TTL; TTL cleanup only rms `os.tmpdir()` workspaces)
- `workspace-model.ts` — workspace classification: `resolveManualTestsDir`, `detectManualProject` (90% rule), `VENDOR_DIRS`, project-meta read/write
- `check-tests.ts` — `runCheckTests(pull|push)` (shared by initial pull + the sync endpoint)
- `api/workspace-sync.ts` — `/api/workspace/sync`: resolve dir + token, run check-tests
- `load-env.ts` — `.env` loader for the bundled app
- `api/*.ts` — ported HTTP handlers (framework-agnostic `(req) => Response`)
- `bridge.ts` — maps pi-coding-agent events → WS messages

**Desktop**
- `src/bun/index.ts` — Electrobun main entry (boots server, opens window)
- `electrobun.config.ts` — app metadata, `build.bun.external` (heavy agent deps kept external), `copy` (ships `out/` + runtime `node_modules`)
- `next.config.ts` — dual-mode export/dev config

## On-disk state

- `~/.testeiya/sessions.json` — active sessions (cwd, projects, tokens, 24h TTL)
- `~/.testeiya/auth.json` — provider key (SQLite-backed via AuthStorage)
- `~/.testeiya/config.json` — optional provider/permissions override (else defaults; provider `openrouter`, model from config)
- `~/.testeiya/testomatio-auth.json` (JWT, 0600) · `~/.testeiya/testomatio-projects.json` (project precache incl. per-project `apiKey`, 0600)
- `~/.testeiya/workspaces/<safe-project-id>/` — persistent per-project workspace: pulled `*.test.md` at the root + `.testeiya/{mcp.json, mcp.all.json, testeiya.json}`. Reused across launches; **not** deleted on session TTL.
- `os.tmpdir()/testeiya-<uuid>/` — ephemeral multi-project `/api/agent/start` workspace (per-`<slug>/` subdirs). Deleted when the session expires.
- The project config dir name (`.testeiya`) and `manual-tests`/`testeiya.json` are centralized in `testeiya/src/project-dir.ts` — the SDK reads MCP/skills/rules from `.testeiya` (see the monkey-patch in `session-factory.ts`), so anything that *writes* MCP config must use the same dir.

## Icons

All icons use **Material Symbols Rounded** (weight 300, fill 0 — outline style). The font is loaded globally in `app/globals.css`.

**Rules:**
- **Never import from `lucide-react` directly** — import everything from `@/lib/icons`.
- For system/UI icons (chevrons, close, search, add, settings, delete, etc.) use the pre-exported wrappers from `@/lib/icons` (e.g. `ChevronDownIcon`, `XIcon`, `PlusIcon`). These render Material Symbols automatically.
- For one-off Material icons not yet in `@/lib/icons`, use the `Icon` primitive: `import { Icon } from "@/lib/icons"` → `<Icon name="arrow_upward" className="size-4" />`.
- Semantic/status icons (tool states, test tree, AI reasoning, etc.) are kept as Lucide SVGs in `@/lib/icons` — do not replace them with Material.
- Size via Tailwind: `size-3`, `size-3.5`, `size-4`, `size-5`, `size-6` — the CSS in `globals.css` maps these to `font-size` for Material Symbols.

## Branding / design system

The brand is **neutral grays + indigo only**, font **THICCCBOI**, light/dark themes. It's wired through the theme variables so it propagates to all shadcn components — don't hardcode colors.

- **Font:** THICCCBOI (self-hosted `@font-face` in `app/globals.css`, files in `public/fonts/`). Set as `--font-sans`/`--font-heading`. JetBrains Mono (`--font-mono`) is kept for code blocks. **Never use italic** — emphasize with color/weight/gradient.
- **Palette:** the `:root` / `.dark` blocks in `app/globals.css` map shadcn tokens to the brand hex — `--primary` = indigo-500 `#6366f1`, neutral surfaces (`#ffffff`/`#fafafa`/`#f5f5f5` light, `#0a0a0a`/`#171717`/`#262626` dark), neutral borders/text. Only `--destructive` (red) and the `--status-*`/`--run-*`/`--type-*` vars stay non-brand (functional status indicators). No `gray`/`zinc`/`slate`/`stone`; no hues other than indigo for accents.
- **Headings:** compact scale in `@layer base` — H1 `text-2xl` (24px) → H6 `text-sm` (14px, the indigo uppercase "eyebrow"). Element defaults only; explicit `text-*` utilities still win.
- To restyle, edit the variables/`@layer base` in `globals.css` — components inherit automatically.

## Tooltips

`TooltipProvider` is mounted globally in `app/layout.tsx` — no need to add it per-component.

**Always wrap with `<Tooltip>` when adding:**
- Icon-only buttons (no visible text label) — toolbars, section headers, inline row actions.
- Buttons whose label is hidden at small viewports (e.g. `hidden sm:inline` text).
- Status indicators or badges that need extra context on hover.

**Pattern** (Base UI via `@/components/ui/tooltip`):
```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

<Tooltip>
  <TooltipTrigger render={<Button aria-label="Refresh" ...><RefreshIcon /></Button>} />
  <TooltipContent><p>Refresh</p></TooltipContent>
</Tooltip>
```

- Use `render=` prop on `TooltipTrigger` — do **not** nest a `<TooltipTrigger>` wrapper around an existing element.
- Keep tooltip text short: action verb + object ("Refresh connections", "Copy code", "Push to Testomat.io").
- For dynamic labels (e.g. toggle state), mirror the same logic in `aria-label` and tooltip text.
- Use `side="right"` for buttons in the left icon strip; default (`"top"`) everywhere else.
- Never use the HTML `title=` attribute as a substitute — it renders an unstyled browser tooltip and is not keyboard-accessible.

## Conventions

- **Ports:** 3050 (web UI dev), 3210 (agent server dev — `app-server.ts`); desktop uses a random free port. Never 3000.
- **Bundling caveat:** the agent SDK's transitive tree can't be fully static-bundled (e.g. `mupdf` top-level await), so `electrobun.config.ts` keeps those deps `external` and ships `testeiya/node_modules` via `copy`. Validate MCP subprocess launch inside a real `electrobun build`.
- **Editing comments in `.ts` configs:** avoid `*/` inside block comments (e.g. write `skills/<name>/SKILL.md`, not `skills/*/SKILL.md`) — it terminates the comment and breaks `electrobun.config.ts` parsing.
- `next start` doesn't work with `output: "export"`; use `app:serve` or the desktop build to serve a production bundle.

## Code Style

These rules target **plain TS/JS** (services in `lib/services/`, the Bun server in `testeiya/src/`, utilities). In React components, framework idioms win where they conflict (e.g. JSX conditional rendering, hooks ordering).

- **Do not write comments unless explicitly specified.**
- **Prefer early exit over `if`/`else`.** Guard-clause and `return` instead of nesting the happy path in an `else`.
- **Use `?.`** instead of chained `a && a.b && a.b.c` checks.
- **No `try`/`catch` inside a `try`/`catch`.**
- **When changing code, make the smallest change possible.**
- **Avoid repetitive code patterns** — factor duplication into the existing structure (not new helpers, see below).
- **Avoid ternary operators.**
- **Never use the `...(condition ? { key: value } : {})` spread pattern** — use a plain `if` statement instead.
- **Don't add functions that weren't asked for** — avoid extracting extra helpers beyond what the task needs.
- **Place `function` declarations at the end of the file**, below the main export that uses them (declarations hoist, so order doesn't matter for visibility). Does not apply to `const`/arrow assignments, which don't hoist.
- **Private methods go after public methods** in a class.
- **Avoid `=== null` / `=== undefined` when not needed** — prefer `if (...)` / `if (!...)`.
- **Use `dedent`** when formatting multi-line prompt strings.
- **Put types at the end of the file.**
