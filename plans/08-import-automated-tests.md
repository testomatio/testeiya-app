# Plan 08 — Import Automated Tests

Wire check-tests' framework analysis into the app so opening an automation repo leads to a guided, previewable, reversible import of its tests into Testomat.io.

Usage flow: [../usage/import-automated-tests.md](../usage/import-automated-tests.md)

## Current state

- `check-tests` 0.20.0 parses 13+ frameworks and imports with `--create --update-ids --keep-structure` — fully capable as a CLI.
- The app's `runCheckTests` accepts only `"pull" | "push"`; the sync endpoint serves only the manual-tests dir. No UI touches framework import.
- Token resolution for arbitrary folders already exists (`resolveProjectCreds`: managed session → linked project apiKey → folder `.env`).

## Implementation

### 1. Backend: `import` action

Extend `CheckTestsAction` with `"import"` and `RunCheckTestsOptions` with `{framework, glob, typescript?, create?, dryRun?, keepStructure?, exclude?}`:

- Command: `check-tests <framework> "<glob>" -d <dir> --update-ids [--typescript] [--create] [--keep-structure] [--exclude <p>]`.
- Dry run = same command **without** `TESTOMATIO` in env (check-tests then analyzes and prints instead of importing) — expose as `dryRun` so the preview never needs a separate code path.
- Route: extend `POST /api/workspace/sync` with the new action + fields; validate `framework` against the known list; `glob` stays inside the workspace (`safeResolve`).
- Detection endpoint: `GET /api/workspace/detect-framework` — cheap heuristics (deps in package.json, config files: `playwright.config.*`, `cypress.config.*`, `codecept.conf.*`, ...) returning `{framework, testDirs, typescript}` candidates. Keep it dumb; the agent refines with `project-scan` when the heuristic is ambiguous.

### 2. Frontend: import affordance

In `WorkspaceSection`, when the workspace is an arbitrary folder with a detected framework and no imported ids yet: an **Import tests** row → dialog with framework (pre-selected), glob, TypeScript toggle, "create suites from folders" toggle → **Preview** (dry run; renders the would-be tree + count) → **Import**. Progress and result use the existing sync overlay. `WorkspaceService` gets `importTests(opts)` mirroring `sync()`.

### 3. Agent path

The `automate-test-cases`/onboarding flows call the same endpoint (not raw bash) so the token never enters the agent's env. Mention the endpoint in the tools prompt layer; gate on workspace-is-arbitrary-folder.

### 4. Reversibility (bounded)

Until check-tests reports created ids (gap C5): before a `--create` import, snapshot the project's test count + latest test id via `tests_list`; after, list tests created since and store their ids in `.testeiya/imports/<date>.json`. An "undo this import" action deletes exactly those ids (bulk `tests_delete`). Imprecise under concurrent edits — say so in the dialog.

## Platform dependencies

- C2 (`--json`) — structured counts for the preview and result; today we parse stdout, which check-tests prints reasonably but unstably.
- C5 (created-ids output) — replaces the snapshot-diff undo with an exact one.

## Risks

- Glob mistakes at scale — dry-run-first is mandatory in the dialog flow; the agent path must also preview before `--create`.
- `--update-ids` rewrites source files — surface the touched-files diff in the workspace tree (changed-files marking already exists) and remind about committing.

## Effort

M backend (action + detect + undo bookkeeping); M frontend (dialog + preview render); S agent prompt.
