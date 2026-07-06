# Plan 09 — Exploratory Testing Sessions

Give exploratory testing a session structure: charters, a persistent session log, evidence capture, and a harvest step that turns findings into bugs and draft test cases.

Usage flow: [../usage/exploratory-testing.md](../usage/exploratory-testing.md)

## Current state

- Browser stack complete: shared session, headed mode, video recording, screenshots, DOM snapshots, `<browser_state>` injection.
- Explorbot skills (`explorbot-setup`, `explorbot-plan`, `explorbot-fundamentals`) ship, but Explorbot itself is not a dependency — the skill installs it per session.
- Evidence and filing primitives exist: screenshot attach, `issues_*` linking, `generate-cases` for harvesting.
- Nothing persists across a session: observations live in the transcript.

## Implementation

### 0. Engine decision (first)

Pick one primary engine and commit:

- **playwright-cli-driven** (recommended): the agent explores directly — no extra dependency, full control, evidence flows through the existing attach path. Explorbot skills stay for users who ask for it explicitly.
- **Explorbot-bundled**: add it as a dependency like `@playwright/cli`; heavier install, but its planning loop is purpose-built.

The rest assumes playwright-cli-driven; swap the execution core if the decision goes the other way.

### 1. Session log format

`.testeiya/exploratory/<date>-<slug>.md`: charter header (target, intent, time box), then appended observation entries — `[severity] title / URL / steps to reach / screenshot ref / notes`. The agent appends after each finding, so a crashed or compacted session loses nothing. The file is the report source.

### 2. `exploratory-session` skill

1. Establish the charter (from the user, or a stored charter file in `.testeiya/charters/`).
2. Open the browser at the target; record video.
3. Explore in a loop: pick the next area from the charter + a visited-map, act, snapshot, judge (errors, validation gaps, console noise, dead ends), log observations with screenshots.
4. Respect the time box / step budget; checkpoint the visited-map into the session log so a follow-up session continues rather than restarts.
5. Close: write the report section — visited-area mermaid map, findings by severity — and present it.
6. Harvest on confirmation: file selected findings as issues (Testomat.io link or Jira via Atlassian MCP), convert selected stable paths to draft `*.test.md` via `generate-cases`, push.

### 3. UI touches (small)

- The recording/screenshot controls already exist in `BrowserControls`; add a "session in progress" indicator sourced from the log file's existence (via the tree — the file shows up in the workspace anyway).
- A chat suggestion chip when a workspace has charters: "Continue exploratory session".

## Platform dependencies

- None from Testomat.io. Evidence attach uses existing endpoints; issues/requirements linking exists.

## Risks

- Unbounded exploration — hard budgets in the skill (max steps, max minutes, max findings before checkpoint) and the charter as the scope contract.
- Destructive actions on real environments — the skill must refuse mutating flows (checkout, deletes) unless the charter explicitly allows them, and prefer incognito/test accounts (`/api/playwright/incognito` exists).

## Effort

S for the log format; M for the skill; S for UI touches. The engine decision is the only blocker and costs a meeting, not code.
