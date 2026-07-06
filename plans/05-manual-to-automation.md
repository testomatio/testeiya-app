# Plan 05 — Manual → Automation Pipeline

Make "automate these manual tests" a tracked pipeline: generate code in the repo's framework, verify against the live app, link IDs, and flip the cases to automated — with progress visible per case.

Usage flow: [../usage/automate-manual-tests.md](../usage/automate-manual-tests.md)

## Current state

- Skills: `project-scan`, `automate-test-cases`, `automation-debug-tests`, `reporter-setup`, `automation-coverage` — all shipped.
- Workspace: arbitrary-folder mode overlays manual tests at `.testeiya/manual-tests/`; code tree visible; bash + browser available for running and debugging tests.
- ID linking exists only as raw CLI (`check-tests <framework> --update-ids`), unreachable through the app's sync layer (hard-coded `pull | push`).
- Progress: the todo panel (`TodoWriteRenderer`) already folds repeated `todo_write` calls into a persistent checklist.

## Implementation

### 1. ID-sync wiring (shared with plan 08)

Extend `runCheckTests` with an `import` action: `check-tests <framework> <glob> --update-ids [--typescript] [--create]`, token resolved through the existing chain (`resolveProjectCreds`). Exposed as `POST /api/workspace/sync {action: "import", framework, glob, create?}`. Plan 08 builds the UI; this plan needs only the endpoint so the agent can link IDs without a raw token in env.

### 2. `automate-cases` pipeline skill

Wrap the existing skills into one procedure with explicit stages per case, driven through `todo_write` so the checklist panel shows progress:

1. **Select** — candidates = manual cases with stable steps, no automated twin; confirm via `multiSelect`.
2. **Scan once** — `project-scan` result cached to `.testeiya/project-scan.md`; reused across cases.
3. **Generate** — `automate-test-cases` per case, following repo idioms; file placed per the scan's layout.
4. **Verify** — run the framework's command for the new file; on failure enter the `automation-debug-tests` loop (max N attempts, then mark the case `needs-human` with notes).
5. **Link** — call the import action (step 1) scoped to the new files; verify `@T` ids landed in titles.
6. **Flip** — `tests_update` to set the case automated (or confirm the import already flipped it); note the code path in the case description.

Stage state lives in the todo list + a pipeline log at `.testeiya/automation/<date>.md`, so an interrupted session resumes by reading the log.

### 3. Target environment config

Same `.testeiya/target.json` as plan 01 (base URL + credential env refs) — generation and verification both need it; implement once, share.

### 4. Reporter handoff

Last pipeline stage offers `reporter-setup` (install `@testomatio/reporter`, wire the config) so CI starts reporting. Keep it optional and separate — teams with reporting already set up skip it.

## Platform dependencies

- None hard. C2 (`--json`) would make the link stage verifiable without parsing stdout; C5 (created-ids reporting) helps only the `--create` path.

## Risks

- Generated tests that pass but assert too little — the skill must translate each `*Expected*:` line into an assertion and fail generation when a step has no expected result (feeds back into design review, plan 03).
- Framework variance — lean on the repo's existing tests as the style source; `project-scan` must capture runner command, fixtures, and selector conventions explicitly.
- Long pipelines vs context — per-case processing with state in files, same principle as plan 01.

## Effort

S for the import action (shared with 08); L for the pipeline skill (the verify/debug loop is the bulk); S for target config (shared with 01).
