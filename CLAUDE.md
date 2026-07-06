@AGENTS.md

# Testeiya Agent

Testeiya is an AI-powered QA agent (chat UI + agent backend). It ships two ways from one codebase:

- **Desktop app** — packaged with [Electrobun](https://github.com/blackboardsh/electrobun) (Bun-based, system webview).
- **Web app** — the same UI served in a browser (and embeddable as an iframe in the Testomat.io product).

## Architecture (read this first)

Everything is served by **one unified Bun server** — `cli/src/app-server.ts`. A single `Bun.serve()` on one origin:

1. serves the statically-exported Next.js UI (`out/`),
2. hosts the HTTP API (`/api/*`),
3. upgrades the agent **WebSocket** (the streaming chat protocol).

```
Bun app-server (cli/src/app-server.ts) — one origin
 ├─ static UI            out/ (next export)
 ├─ HTTP API             /api/* → cli/src/api/*.ts
 └─ WS upgrade           agent stream → cli/src/connection.ts
        │
        └─ pi-coding-agent session (cli/src/session-factory.ts) + MCP + skills
state: ~/.testeiya/{sessions.json, auth.json, config.json}, os.tmpdir()/testeiya-*
```

- **Desktop:** `src/bun/index.ts` (Electrobun main process) boots the app-server on a **random free localhost port** and opens a `BrowserWindow` at it. Bundling is controlled by `electrobun.config.ts`.
- **Web dev:** `next dev` serves the UI with hot reload and **proxies `/api/*`** to the Bun agent server (see `next.config.ts` rewrites); the WebSocket connects to the agent server directly.
- Because the production build is one origin, the UI uses **same-origin** relative `fetch("/api/...")` and a same-origin WebSocket. In `next dev` the WS uses `NEXT_PUBLIC_TESTEIYA_WS_URL` instead (cross-origin to the agent server).

> History: the API used to be Next.js route handlers under `app/api`. Those were ported to `cli/src/api/*.ts` and `app/api` was removed so the UI can be statically exported (`output: "export"`). Don't reintroduce route handlers — add API endpoints to the Bun server instead.

## Run modes

Testeiya has **three runnable surfaces**, all driven by the same `cli/` agent core:

- **Desktop** — Electrobun native window (`npm run desktop:dev`). Boots `app-server.ts` on a random free localhost port and opens a `BrowserWindow` at it.
- **Web** — the same UI in a browser. Dev: `npm run dev` (UI :3050 + agent server :3210). Production: build the static UI, then `cd cli && bun run serve:app` serves UI + API + WS on one origin (`PORT`, default 3050).
- **CLI** — a standalone **terminal agent** (`cd cli && bun src/cli.ts`; published to npm as `testeiya`). No GUI, no HTTP server — it runs the agent in the current working directory.

| Command | What it does | Use for |
|---|---|---|
| `npm run dev` | `next dev` (UI :3050, **hot reload**) + the unified `app-server.ts` on :3210 (`/api/*` + WS); `/api` proxied, WS direct | **Fast day-to-day UI/feature work** (web) |
| `npm run build` | `NEXT_EXPORT=1 next build` → static UI in `out/` | Produce the static UI (serve with `cd cli && bun run serve:app`) |
| `npm run desktop:dev` | `NEXT_EXPORT=1 next build` → `electrobun dev` (native window) | Testing the real desktop shell |
| `npm run desktop:build` | `NEXT_EXPORT=1 next build` → `electrobun build` (installers) | Shipping the desktop app |
| `cd cli && bun src/cli.ts` | The standalone **terminal CLI** agent (no UI/server); reads a provider key from env and runs in the cwd | Terminal / CI agent use |

> The agent server **must** be `app-server.ts` (`testeiya`'s `serve:app`) — it serves `/api/*` + the WS upgrade. The old `server.ts` was WS-only and answered every REST call with `426 Upgrade Required`; its `serve` script has been removed. `npm run dev` wires the correct pair.

`next.config.ts` is **dual-mode**: `NEXT_EXPORT=1` → `output: "export"` (no rewrites/headers, which export forbids); unset → `next dev` with the `/api` proxy. Desktop scripts set `NEXT_EXPORT=1`.

## API key resolution

The agent needs an LLM provider key (default provider `openrouter` → `OPENROUTER_API_KEY`). Resolved in this order (handled by `cli/src/session-factory.ts` via the SDK's `AuthStorage`):

1. **Process env** (exported `OPENROUTER_API_KEY`).
2. **`.env` files** auto-loaded by `cli/src/load-env.ts` — `~/.testeiya/.env`, then walking up from the bundle to the project's `.env` / `cli/.env` (this is what makes a dev `.env` work inside the Electrobun app, whose CWD isn't the project).
3. **In-app Settings UI** → persisted to `~/.testeiya/auth.json`.

In a **packaged** install there's no project `.env` up the tree, so the user supplies the key via Settings (or `~/.testeiya/.env`). Missing key → the agent throws and the UI shows a red banner with an "Open Settings" button.

## Workspace ↔ Project model

This is the core domain model — read it before touching the workspace/sidebar/sync code.

- **Workspace = the current working directory** (a session's `cwd`). Desktop picks it (the native folder picker, or a per-project dir); **web mode** supplies it via the `TESTEIYA_WORKSPACE` env var (`GET /api/workspace/default` opens it on cold load).
- **Project = a Testomat.io project** fetched via API. A workspace *represents* a project on the filesystem. The client-side `ProjectService`/`WorkspaceService` (`lib/services/`) are the business-logic home; sections/dialogs are thin `observer` views.

**Two workspace shapes:**
- **Managed project workspace** — opening a project creates `~/.testeiya/workspaces/<safe-project-id>/` (`projectWorkspaceDir`, `agent-start.ts`), pulls its manual tests to the **root** (a manual-tests-only folder), and writes `.testeiya/testeiya.json` `{projectId, baseUrl, title}` + `.testeiya/mcp.json`. Switching projects switches folders.
- **Arbitrary folder** — the user opens their own dir. It's classified by `resolveManualTestsDir(cwd)` in `cli/src/workspace-model.ts`:
  1. `.testeiya/manual-tests/` exists & non-empty → that's the manual-tests source (tests overlaid onto a code repo; gitignored via `.testeiya/.gitignore`);
  2. else ≥ **90%** of files (recursive, minus `VENDOR_DIRS`) are `*.test.md` → the **root** is the source (`isProject`);
  3. else `null` — nothing loaded; a pull seeds `.testeiya/manual-tests/`.

**Sidebar tree** (`GET /api/files/tree`, `files-tree.ts`): all non-vendor, non-dot **folders** are shown; **only `*.test.md` files** outside the manual-tests dir; **all files** inside it (and the dir is auto-expanded, even when it lives under `.testeiya/`). The response carries `{ manualTestsDir, isProject, project }`.

**Sync** (`POST /api/workspace/sync` `{session, action}`): runs `check-tests` (`cli/src/check-tests.ts`, `npx check-tests[@latest] pull|push -d <dir>`) for the resolved manual-tests dir. Token resolution: a managed session's `tokens[slug]` → else the linked project's `apiKey` via the connected account (`.testeiya/testeiya.json` + `loadStoredAuth`) → else the folder's own `.env` `TESTOMATIO`. The Workspace sidebar section has Pull/Push buttons (`WorkspaceService.sync`). Sync semantics follow the vendored `cli/skills/Test Management/sync-test-cases-with-tms/SKILL.md` (from `testomatio/skills`).

> Session expiry (`session-store.ts`) only deletes **`os.tmpdir()`** workspaces — persistent `~/.testeiya/workspaces` dirs and folders the user opened are never removed on TTL.

## Skills (prebuilt + custom)

Testeiya passes an **explicit `skills[]` array** into `createAgentSession` (`session-factory.ts`), which bypasses the SDK's own skill discovery. The array is `dedupeSkillsByName([...playwright, ...loadBundledSkills(), ...loadCustomSkills(cwd)])`, so a later source (custom last) can **override** an earlier one by reusing its `name`.

Skills reach the agent from **two sources**, each with one simple rule:
1. **Prebuilt (`cli/skills.yaml`)** — a **flat list of GitHub repos**, one `owner/repo` per line (optionally `owner/repo/tree/<ref>/<subdir>` to pin a ref or point at a subfolder — e.g. the playwright-cli skill is `microsoft/playwright-cli/tree/main/skills/playwright-cli`). **No exceptions — every line is a GitHub repo.** Vendored into `cli/skills/` at build time (below).
2. **User custom** — folders the user drops in `~/.testeiya/skills` / `<cwd>/.testeiya/skills` (below).

> A skill that lives in an npm package is **never** put in `skills.yaml` (the vendor only clones GitHub). The `@playwright/cli` package stays a dependency, but only for the browser CLI **tool** (the binary the agent drives) — `hasPlaywrightCli()` gates the browser guidance on it. The playwright-cli **skill** is vendored from GitHub like everything else.

- **Vendoring** (build time): the **`vendorSkills`** task in **`cli/Bunoshfile.js`** — run **`bunosh harness:vendor`** from the repo root (or `bunosh vendor:skills` from `cli/`); **no `cd cli` for `bun run`**. It resolves each source's SHA via the GitHub API, downloads the tarball (no `git` binary), and copies the selected skills into a committed tree **organized by category folder: `cli/skills/<category>/<skill>/`**. The **category is decided by the repo**: if the repo has a Claude-plugin marketplace (`.claude-plugin/marketplace.json`), every plugin is a category and the skills it lists (via symlinks in `plugins/<p>/skills/`) get it — so `testomatio/skills` splits into **Test Management / Test Automation / Explorbot** on its own, `codeceptjs` → **Codeceptjs**. A repo with **no marketplace** uses its **repo name** as the category (`currents-dev/playwright-best-practices-skill` → **Playwright Best Practices Skill**). The category name is **slugified into the folder name** (`Test Management` → `test-management`); `loadBundledSkills()` reads it back with the inverse (prettify the folder). A skill in the repo but **not in any plugin is skipped** (the vendor logs it). A repo that is **one skill** (its `SKILL.md` is at the root) is vendored **flat** as `cli/skills/<repo-name>/` — no redundant `<repo>/<skill>/` nesting; `loadBundledSkills()` treats a top-level folder that has its own `SKILL.md` as that single skill. SHAs are pinned in `cli/skills.lock.json`. Edit the manifest + re-run to add/update/swap; **`bunosh harness:skills`** (or `bunosh skills` from `cli/`) lists the vendored skills grouped by category. The tree + manifest ship via `cli/package.json` `files` and the `electrobun.config.ts` copy map; `resolveBundledSkillsDir()` (`project-dir.ts`) probes for the tree like `resolveStaticDir()` finds `out/`. **On release** both CI jobs re-run the vendor task (`.github/workflows/release.yml`) so shipped skills are always current — the committed tree is a dev-time cache.

**Custom (user) skills:** a *skill* is a folder containing a `SKILL.md` (YAML frontmatter `name` + `description`, then the body). Drop or **symlink** one into the global `~/.testeiya/skills/` (`CUSTOM_SKILLS_DIR`) — applies to every session — or a workspace's `<cwd>/.testeiya/skills/` (`projectSkillsDir(cwd)`) for a per-project skill. Custom skills are **flat** (no category folders — unlike the vendored tree): each direct subfolder with a `SKILL.md` is a skill; `loadCustomSkills` follows symlinks (so a skill can be linked in) and ignores non-skill entries.

- **Loader:** `cli/src/skills.ts` — `loadBundledSkills`, `loadCustomSkills(cwd?)`, `hasPlaywrightCli()` (browser-tool gate), `ensureCustomSkillsDir()`, `dedupeSkillsByName()`; all reuse the `readSkill` / `readSkillsDir` choke-points. `readSkill` uses the frontmatter `name` only when it's a valid slug, else the folder name (so a mention is always a clean token).
- **UI:** the prompt input's `SkillsMenu` lists every skill **grouped by category** (custom ones badged), with **Open skills folder** (`Utils.openPath` via `/api/skills/open`; web mode toasts the path) and **Refresh** (`SkillsService.refresh()`) in the footer. `/api/skills` returns `{ name, description, source, category }`.

## HTTP API (served by the Bun app-server)

| Route | Method | Purpose |
|---|---|---|
| `/api/agent/start` | POST | Pull projects from Testomat.io into a temp workspace, write MCP config, create a session |
| `/api/agent/:sessionId` | GET | Session metadata |
| `/api/files/read` · `/api/files/tree` · `/api/files/write` | GET/GET/POST | Workspace file editor (path-sandboxed) |
| `/api/testomatio/:resource` | GET | Read-only proxy to Testomat.io v2 REST (SSRF-guarded whitelist) |
| `/api/settings` | GET/POST | Report whether a key is configured / save the provider API key |
| `/api/mcp` | GET/POST | List MCP servers for a session / enable-disable each |
| `/api/skills` · `/api/skills/open` | GET/POST | List bundled + custom skills (optional `?session`) / reveal the global custom-skills folder |
| `/api/workspace` · `/api/workspace/pick` | POST | Open a local dir as the workspace / native folder picker (Electrobun) |
| `/api/workspace/default` | GET | Web-mode default workspace from `TESTEIYA_WORKSPACE` (reuses a live session for the same dir) |
| `/api/workspace/sync` | POST | Run `check-tests pull`/`push` for the workspace's manual tests |

## WebSocket protocol (`hooks/use-testeiya.ts` ↔ `cli/src/connection.ts`)

Client → server: `{type:"prompt", message, ...params}`, `{type:"abort"}`, `{type:"new_session"}`.
Server → client: `session_created`, `start`, `text-start|delta|end`, `reasoning-start|delta|end`, `tool-input-available`, `tool-output-available`, `finish`, `done`, `error`, `session_cleared`.

The hook has a **stall watchdog**: if no event arrives for 45s after a send it surfaces a visible error (no more silent "nothing happened"). The agent session is created on the first prompt of a connection.

## Verifying the Testomat.io REST API

**When you need to check how the Testomat.io REST API actually behaves** — real URLs, query params, status codes, or response shapes — **read `cli/log/testomatio.http`** instead of guessing. While debug mode is on, every outbound Testomat.io call (the v2 proxy, attachment upload, transcription) is appended there as a re-runnable `.http` block with the **response captured as trailing `#` comments** (see `cli/src/debug-bus.ts`).

- **Populated when debug mode is on:** the sidebar Debug panel is open (an `/api/debug/stream` SSE subscriber is connected) **or** the server runs with `TESTEIYA_DEBUG=1`. To capture a specific call, turn the panel on (or set the env var) and trigger it from the UI.
- The file is **gitignored** (`log/` in the submodule), append-only, and re-runnable in the VS Code REST Client / JetBrains HTTP client.
- It contains the live `Authorization: Bearer` token — treat it as a credential; never commit or paste it.

## Debugging (the `testeiya-debug` skill)

**When anything in Testeiya misbehaves — a UI error, a failed request, a project that won't load, a wrong agent answer, a crash — use the `testeiya-debug` skill** (`.claude/skills/testeiya-debug/SKILL.md`) instead of guessing. It collects the whole stack into readable files so a fix has full context: the Bun app-server (CLI), the web/desktop UI + its MobX state, same-origin `/api/*` requests, outbound Testomat.io REST, and the LLM agent.

### The debug snapshot (server + browser, one JSON)

`GET /api/debug/snapshot?session=<id>` merges everything into one dump. The **server** side (`cli/src/debug-bus.ts`) already held outbound Testomat.io REST (`server.requests`) and LLM events (`server.ai`); `captureServerConsole()` adds the app-server's own stdout (`server.console`). The **browser** pushes what the server can't see via `POST /api/debug/report` — its unified `/api/*` + agent-WS log, captured `console.error`/`warn` + uncaught errors, and a MobX store snapshot (`client.entries` / `client.store` / `client.meta`). The client reports **errors always** (even with the Debug panel closed) and a full snapshot on load, on panel-open, and every 15s while the panel is on (`lib/services/debug-log-service.ts`).

The running server publishes its (possibly random, desktop) port + pid to `~/.testeiya/server.json` (`cli/src/server-info.ts`, removed on exit) so the tooling finds it. Pull a snapshot with:

```bash
cd cli
bun run debug:snapshot [agent-conversation-id]   # → cli/log/debug-snapshot-*.json (auto-discovers the server)
```

Correlate **downstream → upstream**: a failing `client.entries` request → the matching `server.requests` (the real Testomat.io call) → the thrown error in `server.console` → the exact request/response in `cli/log/testomatio.http`. A wrong-looking UI with no failed request is usually a stale/incorrect `client.store` value.

### Langfuse trace (the LLM's-eye view)

For **what the agent decided** (wrong tool, bad output), fetch its trace. `cli/src/telemetry.ts` traces every run when `LANGFUSE_*` keys are set: one **trace per prompt**, tagged `["testeiya", <mode>]`, the agent conversation id as the trace `sessionId`, an `llm-generation` child per model call, and one child per tool call (`level: "ERROR"` on failures).

```bash
bun run debug:trace session:<conv-id>     # every prompt in one chat session
bun run debug:trace <trace-id>            # one trace (id from the Langfuse UI)
bun run debug:trace 30m | 1h | today      # recent traces by time range
```

- Auto-detects the arg; prefix `trace:` / `session:` / `range:` to force it (a hex conversation id can look like a trace id).
- Output → `cli/log/langfuse-trace-*.json` (**gitignored**); holds full prompts + tool IO — sensitive, never commit or paste it.
- Needs `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` (+ optional `LANGFUSE_BASE_URL`); `bun run setup:env` seeds `~/.testeiya/.env`. No keys → telemetry is a silent no-op.

```bash
jq '.[0].observations[] | select(.type=="GENERATION") | .input' <file>      # what the model actually saw
jq '[.[].observations[] | select(.level=="ERROR") | {name, output}]' <file> # failed tool calls
```

Look for **mismatches**: what the model's `llm-generation` output claimed vs. what the tool observation's `output`/`level` actually did.

## Key files

**Frontend**
- `app/page.tsx` — main chat page + header (workspace toggle, workspace-open, theme toggle, Clear, Settings) + error banner
- `app/layout.tsx` — providers + anti-FOUC theme script
- `hooks/use-testeiya.ts` — WS hook: connection, streaming, tool calls, error state, watchdog, dev-vs-prod WS URL
- `lib/theme.tsx` — single source of truth for light/dark (`useTheme`); applies `.dark`/`.light`, persists, follows host when embedded
- `lib/host-bridge.tsx` — iframe-embed context (host theme/JWT via postMessage)
- `lib/services/` — MobX service layer (business logic): `WorkspaceService` (tree load, classification, `sync(pull|push)`, `openDefault`), `ProjectService`, `ConnectionsService`, `ProvidersService`; consumed via `useXService()` from `observer` views
- `components/panel/sections/WorkspaceSection.tsx` — file tree + Open-folder / Pull / Push / Refresh actions (thin `observer` over `WorkspaceService`)
- `lib/debug/{external-log,store-snapshot}.ts` + `lib/services/debug-log-service.ts` — client debug capture: unified `/api/*` + agent-WS + console log, MobX store snapshot, and the `report()` that pushes them to the server (see "Debugging"); `components/panel/sections/DebugSection.tsx` renders the panel
- `components/SettingsDialog.tsx` — provider key + MCP toggles + workspace section
- `components/workspace/MarkdownEditor.tsx` — file editor (theme-synced)
- `components/themed-toaster.tsx` — theme-bound sonner toasts
- `components/ai-elements/` — chat UI primitives

**Backend (`cli/src/`)**
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
- `debug-bus.ts` · `ai-debug.ts` · `api/debug-{stream,snapshot,report}.ts` — the debug pipeline: server ring buffer + console capture + `buildSnapshot`, LLM-event recorder, and the SSE/pull/push endpoints (see "Debugging")
- `server-info.ts` — writes/reads `~/.testeiya/server.json` so out-of-band tooling finds the running server
- `scripts/{debug-snapshot,langfuse-trace,setup-env}.ts` — the `debug:snapshot` / `debug:trace` / `setup:env` helpers

**Desktop**
- `src/bun/index.ts` — Electrobun main entry (boots server, opens window)
- `electrobun.config.ts` — app metadata, `build.bun.external` (heavy agent deps kept external), `copy` (ships `out/` + runtime `node_modules`)
- `next.config.ts` — dual-mode export/dev config

## On-disk state

- `~/.testeiya/sessions.json` — active sessions (cwd, projects, tokens, 24h TTL)
- `~/.testeiya/auth.json` — provider key (SQLite-backed via AuthStorage)
- `~/.testeiya/config.json` — optional provider/permissions override (else defaults; provider `openrouter`, model from config)
- `~/.testeiya/server.json` — the running app-server's `{port, pid, url, mode, startedAt}` (`server-info.ts`); lets `debug:snapshot`/the `testeiya-debug` skill find the desktop app's random port. Written on start, removed on exit.
- `~/.testeiya/testomatio-auth.json` (JWT, 0600) · `~/.testeiya/testomatio-projects.json` (project precache incl. per-project `apiKey`, 0600)
- `~/.testeiya/workspaces/<safe-project-id>/` — persistent per-project workspace: pulled `*.test.md` at the root + `.testeiya/{mcp.json, mcp.all.json, testeiya.json}`. Reused across launches; **not** deleted on session TTL.
- `~/.testeiya/skills/<skill>/SKILL.md` — user's global custom skills, loaded for every session (`CUSTOM_SKILLS_DIR`). Entries may be **symlinks** to skills that live in another repo. A per-workspace `<cwd>/.testeiya/skills/` is also loaded when that workspace is open. See "Custom skills" below.
- `os.tmpdir()/testeiya-<uuid>/` — ephemeral multi-project `/api/agent/start` workspace (per-`<slug>/` subdirs). Deleted when the session expires.
- The project config dir name (`.testeiya`) and `manual-tests`/`testeiya.json` are centralized in `cli/src/project-dir.ts` — the SDK reads MCP/skills/rules from `.testeiya` (see the monkey-patch in `session-factory.ts`), so anything that *writes* MCP config must use the same dir.

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
- **Bundling caveat:** the agent SDK's transitive tree can't be fully static-bundled (e.g. `mupdf` top-level await), so `electrobun.config.ts` keeps those deps `external` and ships `cli/node_modules` via `copy`. Validate MCP subprocess launch inside a real `electrobun build`.
- **Editing comments in `.ts` configs:** avoid `*/` inside block comments (e.g. write `skills/<name>/SKILL.md`, not `skills/*/SKILL.md`) — it terminates the comment and breaks `electrobun.config.ts` parsing.
- `next start` doesn't work with `output: "export"`; use `app:serve` or the desktop build to serve a production bundle.

## Code Style

These rules target **plain TS/JS** (services in `lib/services/`, the Bun server in `cli/src/`, utilities). In React components, framework idioms win where they conflict (e.g. JSX conditional rendering, hooks ordering).

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
