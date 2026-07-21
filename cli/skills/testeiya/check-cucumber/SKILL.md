---
name: check-cucumber
description: Sync Gherkin `.feature` files with Testomat.io using the check-cucumber CLI. Import Features as suites and Scenarios as tests, write `@S`/`@T` IDs back, check or clean IDs, and pull manual BDD tests as feature files. The BDD counterpart to check-tests; Testeiya's built-in sync never touches `.feature` files. Use in a Cucumber, CodeceptJS-BDD, or Gherkin repo to import, push, sync, pull, or ID-tag features and scenarios.
license: MIT
metadata:
  author: Testomat.io
  version: 1.0.0
---

# check-cucumber

The `check-cucumber` CLI syncs Gherkin `.feature` files with Testomat.io. npm package `check-cucumber` (v0.6.x), run with `npx`. It:

- imports every Feature as a suite and every Scenario as a test case;
- writes `@S`/`@T` IDs back into the files for round-tripping;
- pulls manual BDD tests from Testomat.io as `.feature` files.

## Use cases

- Import a Cucumber repo's features and scenarios into Testomat.io.
- Write `@S`/`@T` IDs into the feature files so they round-trip with the TMS.
- Import one directory without detaching the rest of the project.
- Import into a branch, with labels, excluding drafts.
- Gate CI on missing IDs (`--check-ids`).
- Pull the project's manual BDD tests down as `.feature` files.
- Diagnose an import that printed success but changed nothing.

## Which tool for which tests

A Cucumber project's `.feature` files ARE its tests. They are not `*.test.md`, and Testeiya's built-in sync does not cover them.

- `*.test.md` markdown or code-based specs → `check-tests`.
- Gherkin `.feature` files → this skill.
- Test run RESULTS → `@testomatio/reporter` (`testomatio-reporter`, `qa-e2e-tests-reporting`).
- Unsure of the project kind → `scan-automation-project` first.

Never run `check-tests` over a `features/` directory, or `check-cucumber` over a markdown manual-tests directory.

## Critical rules

- **The import command REQUIRES the positional glob.** `npx check-cucumber -d features` alone prints the banner and exits 0 — a silent no-op. Always pass the pattern: `npx check-cucumber "**/*.feature" -d features`.
- **Import failures exit 0.** A rejected import logs `✖️` and exits 0; a missing key logs `Cant send report, api key not set` and exits 0. Judge success by the output text (`Data sent to Testomat.io`), never the exit code.
- **A partial import detaches everything else.** Importing a subset marks every test not in the payload as detached. Pass `--no-detached` for partial imports.
- **Destructive flags need explicit confirmation first.** `--purge`/`--unsafe-clean-ids` regex-strip every `@S`/`@T`-shaped tag (may eat unrelated tags like `@Test1234`); `--clean-ids` removes this project's IDs; `pull` overwrites same-named files. Preflight: clean/committed git tree; `pull --dry-run` first; grep for near-miss tags before a purge.
- **`Rule:` blocks crash the parser** (`TypeError: Cannot read properties of null (reading 'tags')`, exit 1). Scenarios must sit directly under `Feature:`.
- **Do not pass options to the `push` subcommand.** A parsing quirk makes the root command swallow shared options (`-d`, `--sync`, `--update-ids`, `--check-ids`, …). Use the root form `check-cucumber "<glob>" [options]` for every import.
- One source of truth per test — never double-import. A scenario synced here is automated in Testomat.io; don't also push it as markdown via check-tests.
- Quote the glob so the shell doesn't expand it.

## Testeiya workspace context

- A workspace is the session cwd representing one project; metadata in `.testeiya/testeiya.json` (`{projectId, baseUrl, title}`). When `baseUrl` isn't `https://app.testomat.io`, export it as `TESTOMATIO_URL`.
- `cli/src/workspace-model.ts` classifies a Cucumber repo as an automation workspace (`.feature` files + a cucumber config or `@cucumber/cucumber` dependency mark `hasAutomationConfig`).
- So Testeiya's built-in pull omits `--export-automated` here: `.testeiya/manual-tests/` holds only manual markdown, and the `.feature` files stay the single source for automated ones. Keep it that way.
- The built-in sync never picks up `features/` — feature-file sync is always an explicit check-cucumber run by the agent.

### Token resolution

check-cucumber reads only `TESTOMATIO` (a `tstmt_…` key; `.env` in the cwd is auto-loaded). Resolve in Testeiya's order:

1. the managed session's project token;
2. else the linked project's `apiKey` from the connected account;
3. else the folder's own `.env` `TESTOMATIO`;
4. else ask the user (Settings → Project → Project Reporting API key).

### Manual vs automated

- Each pulled markdown test carries `type: manual` or `type: automated`; a missing `type:` means manual.
- Gherkin scenarios imported here land on the automated side — they are backed by step definitions.
- Two exceptions import as manual: a `*.manual.feature` file (every scenario in it), and files created by `check-cucumber pull` (the pull exports the project's manual tests as Gherkin).
- If a case already exists as a manual markdown test and the user automates it, bind them by putting the existing `@T…` ID on the scenario — don't import a duplicate. See `automate-manual-test-cases`.

## Commands

```bash
npx check-cucumber "<glob>" [options]     # analyze + import (the push direction)
npx check-cucumber pull [--dry-run]       # pull manual tests as .feature files (into cwd)
```

The glob resolves relative to `-d` (default cwd). `node_modules` is excluded automatically, but scope with `-d` on large repos anyway.

### Import options (root command)

| Flag | Meaning |
|---|---|
| `<glob>` (positional) | Required. `"**/*.feature"` for the whole tree |
| `-d, --dir <dir>` | Scan root (default cwd). Scope to `features/` etc. |
| `-e, --exclude <glob>` | Skip files: `-e "**/wip/*.feature"` |
| `--sync` | Wait until the server finishes. Use in CI and whenever a next step depends on the import |
| `-U, --update-ids` | Import, wait, then write `@S`/`@T` IDs back. Needs the key |
| `--check-ids` | Exit 1 when any feature/scenario lacks an ID (CI guard); proceeds with the import when all present |
| `--create` | Create tests/suites for IDs not found in the project |
| `--no-detached` | Don't detach absent tests. Required for partial imports |
| `--no-empty` | Delete suites left empty after import. Conflicts with `--keep-structure` |
| `--keep-structure` | Force the source structure onto the project |
| `-c, --codeceptjs` | CodeceptJS-BDD projects; accepted for compatibility, no payload change in 0.6.0 |
| `--clean-ids` | **Destructive.** Remove this project's IDs (needs the key). Confirm first |
| `--purge` / `--unsafe-clean-ids` | **Destructive.** Strip all `@S`/`@T`-shaped tags, no server check (no key needed). Confirm first |

### Pull options

- `--dry-run` — preview the file list without writing. Always run first.
- `pull -d` is BROKEN in 0.6.0 (swallowed by the root command) — pull always writes to the cwd, so `cd` into the target dir before pulling.
- Pull calls `GET {TESTOMATIO_URL}/api/test_data?api_key=…&with_files=true`, creates nested dirs, and overwrites same-named files.

## Environment variables

A `.env` in the cwd is auto-loaded (dotenv).

| Variable | Purpose |
|---|---|
| `TESTOMATIO` | Project API key (`tstmt_…`). Required for import, IDs, pull |
| `INPUT_TESTOMATIO-KEY` | Alternative key slot (GitHub Actions); takes precedence over `TESTOMATIO` |
| `TESTOMATIO_URL` | Instance URL (default `https://app.testomat.io`). Set from `.testeiya/testeiya.json` `baseUrl` on self-hosted |
| `TESTOMATIO_BRANCH` | Import into this branch; created if missing |
| `TESTOMATIO_SUITE` | Import everything into an existing suite by ID (`@Sa1b2c3d4`) |
| `TESTOMATIO_PREPEND_DIR` | Wrap imported files under a new top folder |
| `TESTOMATIO_WORKDIR` | Rebase reported file paths to this directory |
| `TESTOMATIO_LABELS` | Comma-separated labels on every imported test; `label:value` sets values. Alias `TESTOMATIO_SYNC_LABELS` |
| `TESTOMATIO_NO_DETACHED` | `1` = same as `--no-detached` |
| `TESTOMATIO_TITLE_IDS` | `1` = write test IDs into Scenario titles instead of tags |

## Gherkin → Testomat.io mapping

| Gherkin | Testomat.io | Notes |
|---|---|---|
| folder / `x.feature` file | suite hierarchy | folders and file names become parent suites |
| `Feature:` | suite | feature tags travel with the suite; empty title = file skipped with an error |
| `Scenario:` | test (automated) | full source block becomes the test body; empty title = scenario skipped |
| `Scenario Outline:` + `Examples:` | ONE test | not expanded per row; the Examples table stays in the body |
| tags (`@smoke`, `@severity:critical`) | tags on the test | sent without `@`; `@S`/`@T` ID tags are treated as sync IDs, not tags |
| `Background:` | NOT imported | parses fine, but its steps appear in no test — keep critical context in scenarios |
| `Rule:` | NOT supported | crashes the analyzer |
| `And` / `But` | normalized | inherit the preceding Given/When/Then keyword |
| `*.manual.feature` | manual tests | the marker for manual BDD cases kept in the repo |

`--update-ids` write-back: IDs are inserted as tags — appended to an existing tag line, else a new tag line above `Feature:`/`Scenario:`, indentation preserved. Files carrying IDs from another project warn `Some tests have IDs from another project` and are left alone — clean with `--clean-ids` (old key) or a confirmed `--purge`.

## Recipes

From the workspace root, token in `.env` or env:

```bash
# First import, waiting for the server
npx check-cucumber "**/*.feature" --sync

# Import and write IDs back (the standard round-trip sync)
npx check-cucumber "**/*.feature" --update-ids

# CI guard — fail when IDs are missing
npx check-cucumber "**/*.feature" --check-ids

# Partial import of one directory, rest untouched
npx check-cucumber "**/*.feature" -d features/checkout --no-detached

# Import into a branch, with labels, excluding drafts
TESTOMATIO_BRANCH="release-2.4" TESTOMATIO_LABELS="smoke,severity:high" \
  npx check-cucumber "**/*.feature" -e "**/wip/*.feature" --sync

# Self-hosted instance
TESTOMATIO_URL="https://testomatio.example.com" npx check-cucumber "**/*.feature" --sync

# Pull manual BDD tests into a dedicated directory (pull writes to cwd)
mkdir -p features/manual && cd features/manual
npx check-cucumber pull --dry-run
npx check-cucumber pull

# Re-import as a new project (confirm + commit first)
npx check-cucumber "**/*.feature" --purge
TESTOMATIO=<new-project-key> npx check-cucumber "**/*.feature" --update-ids
```

## Exit codes and troubleshooting

Exit 1: `--check-ids` found missing IDs; `pull` without a key or with a failed request; the `Rule:` analyzer crash. Everything else — rejected imports, parse errors, a missing key on import — exits 0, so always read the output.

| Symptom | Cause | Fix |
|---|---|---|
| Banner prints, nothing else, exit 0 | Positional glob missing | Add `"**/*.feature"` |
| `Cant send report, api key not set` | `TESTOMATIO` unset | Resolve the token; the run parsed files but imported nothing |
| `✖️ <server message>` after `Sending data…` | Server rejected the import (bad/foreign token) — exit still 0 | Verify the key matches this project |
| `✖️ Error: Server cannot be reached` | Network / wrong `TESTOMATIO_URL` | Check the URL against `.testeiya/testeiya.json` `baseUrl` |
| `TypeError: … (reading 'tags')` | A `Rule:` block | Flatten scenarios directly under `Feature:` |
| `Errors :` listing `expected: #EOF, …` | Gherkin syntax error — that file is skipped, exit stays 0 | Fix the reported line; re-run |
| `Total Scenarios skipped N` | Scenarios with empty titles | Give every scenario a title |
| `N suites and M tests are missing test IDs!` (exit 1) | `--check-ids` failed | Run with `--update-ids` |
| `Some tests have IDs from another project` | Foreign `@S`/`@T` tags | `--clean-ids` with the old key, or a confirmed `--purge` |
| Tests unexpectedly detached | A partial import without `--no-detached` | Re-import the full tree; use `--no-detached` for partial runs |
| Pull wrote files to the wrong place | `pull -d` not honored in 0.6.0 | `cd` into the target dir first |
| Pull says `No files found on server` | The project has no manual tests to export | Nothing to pull; check the project kind |

## Related skills

- `check-tests` — the markdown/code counterpart; Testeiya's built-in sync path.
- `sync-test-cases-with-tms` — markdown pull/push workflow details.
- `testomatio-reporter` / `qa-e2e-tests-reporting` — report cucumber RUN RESULTS; check-cucumber only syncs definitions.
- `scan-automation-project` — detect the framework before choosing a sync tool.
- `automate-manual-test-cases` — bind existing manual cases to new scenarios by ID.
- `qa-test-code-coverage` — map source files to imported test IDs.
- `testomatio-mcp` — query the project's suites and tests directly.
