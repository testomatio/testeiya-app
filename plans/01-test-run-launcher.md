# Plan 01 — Test Run Launcher with Browser-Assisted Execution

Turn the existing run-creation dialog, guided executor, and browser stack into one coherent flow: launch a run from the UI, let the agent execute or assist each test in a real browser, and record results with evidence.

Usage flow: [../usage/launch-test-run.md](../usage/launch-test-run.md)

## Current state

- `CreateRunDialog.tsx` creates runs (`POST /api/testomatio/runs`), including from a plan; `PlanItemRenderer` has a **Launch run** button.
- `ManualRunRenderer.tsx` is the guided executor with agent-drivable `ui_widget` actions: `list, search, filter_status, select_test, set_status, set_message, save_next, finish_run`; destructive actions already require `ask_question` confirmation (`cli/src/prompt/app-ui.ts`).
- Browser: shared `playwright-cli` session between UI and agent, `<browser_state>` prompt injection, `/api/playwright/screenshot|attach` for evidence (`cli/src/api/playwright-cli.ts`).
- Run detail widget shows donut + testruns table; stats come from the JWT-only run-stats endpoint.

## Implementation

### 1. `execute-manual-test` skill (agent orchestration)

Add a skill to `@testomatio/skills` (or a Testeiya-local skill dir) that chains, per test:

1. Read the case from the workspace markdown (`findTestBlock` semantics: steps + `*Expected*:` lines).
2. Ensure the browser session is open at the app's base URL; execute preconditions.
3. Execute steps via `playwright-cli`; after each step compare page state against the expected line.
4. Produce a verdict draft: proposed status, per-step notes, screenshot on mismatch.
5. Present the verdict via `ask_question` (confirm/override); then `set_status` + `set_message` + `save_next` through the widget.

Gate widget/`ask_question` usage on tool availability so the skill still works in the terminal CLI (prints the verdict instead).

### 2. Run modes in the executor

Add a mode toggle to `ManualRunRenderer`: **Manual** (today's behavior), **Assisted** (agent navigates to precondition state, human judges), **Agent** (skill executes; human confirms verdicts). The mode is UI state passed to the agent through the existing `<active_widget>` context block — extend the snapshot with `mode` so the agent knows how far to go.

### 3. Environment config

Per-workspace target config the skill reads instead of asking each session: `.testeiya/target.json` `{ baseUrl, credentialsRef }`. Read it in `session-factory.ts` and inject into the system prompt alongside `<browser_state>`. Never store raw credentials; reference env var names.

### 4. Result reporting

Keep one `testruns` PUT/POST per result for now (matches the executor's save-per-test rhythm). For agent-executed batches, buffer verdicts and write on `save_next` — revisit when a bulk endpoint exists (platform gap A4).

### 5. Automated runs (blocked)

The "Launch run" flow for `kind: automated` needs the CI trigger endpoint (gap A5). Until then: hide the automated kind's launch affordance behind a "report-only" explanation, or let the agent run the project's test command locally via bash when the workspace is the automation repo (that path already works — document it in the skill).

## Platform dependencies

- A1 (run counters via project token) — stats for token-only sessions.
- A4 (batch results) — scale for agent-executed runs.
- A5 (CI trigger) — automated run launch.
- A6 (webhooks) — polish only; polling stays.

## Risks

- Agent misjudging "expected vs actual" — mitigated by confirm-by-default (`ask_question`) and screenshots on every failed comparison.
- Long runs exhausting context — the skill must process tests one at a time and rely on the widget as state, not the transcript.

## Effort

M for the skill + executor mode; S for target config. No schema/API changes app-side.
