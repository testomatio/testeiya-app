---
name: check-tests
description: Sync Testomat.io test cases with the check-tests CLI. Pull tests to `*.test.md` markdown, push markdown back, import automated test code (Playwright, CodeceptJS, Jest, Cypress, Mocha, Vitest, WebdriverIO), and round-trip `@T`/`@S` IDs. Powers Testeiya's Pull/Push buttons. Use to pull, push, sync, import, or export test cases; add, check, or clean test IDs in source; or debug a failed pull, push, or import.
license: MIT
metadata:
  author: Testomat.io
  version: 1.0.0
---

# check-tests

The Testomat.io sync CLI. npm package `check-tests`, run with `npx`. Three commands:

- `check-tests pull` — download a project's tests as `*.test.md` files.
- `check-tests push` — upload local `*.test.md` files, then write assigned `@T`/`@S` IDs back.
- `check-tests <framework> <glob>` — statically parse automated test code (AST only, no execution) and import it.

This is the exact tool behind Testeiya's Pull/Push buttons (`POST /api/workspace/sync` → `cli/src/check-tests.ts`). Raw calls hit the same files and the same project as the buttons.

## Use cases

- Pull a project's manual tests into local markdown to read or edit them.
- Push edited or newly written `*.test.md` cases back to the project.
- Import an automation repo's specs (Playwright, CodeceptJS, Jest, …) into the project.
- Stamp `@T`/`@S` IDs into markdown or source so files round-trip with the TMS.
- Pull only selected suites, or push only the files just changed.
- Check IDs in CI, or clean IDs before a fresh import.
- Diagnose a pull/push/import that reported success but changed nothing.

## Which tool for which tests

- `*.test.md` markdown and code-based specs → this skill.
- Gherkin `.feature` files → `check-cucumber` (never run check-tests over `features/`).
- Test run RESULTS (pass/fail of executed runs) → `@testomatio/reporter`.
- Unsure of the project kind → `scan-automation-project` first.

## Critical rules

- **A push or import without a token silently does nothing and exits 0.** The output says `API key not provided`, but the exit code is success. Judge success by the output — `Data received at Testomat.io` (and for push, `N files updated.`), never by exit code.
- **Destructive operations need explicit user confirmation first.** `--purge`/`--unsafe-clean-ids` strip IDs with no server check; `--clean-ids` strips known IDs; push overwrites project content and detaches unmatched tests; pull overwrites local files. Before any: say what changes, get a yes, preflight (`pull --dry-run`, `--no-detached` for a subset, git-commit before ID cleanup).
- **Never change an existing `id:` in a `*.test.md` file.** The ID is the match key; an edited one makes the next push create a duplicate.
- **Never write a tag shaped like `@T`/`@S` + 8 alphanumerics** (e.g. `@Ta1b2c3d4`). That pattern is reserved for IDs and corrupts sync.
- Automated tests pulled as markdown are references, not runnable code — the implementation lives in the automation repo and runs via a CI profile. Do not edit them to change behavior.
- Never count manual tests by grepping `type: manual`. A block with no `type:` line is manual, and that is the common case.
- Use only flags documented here or shown by `npx check-tests --help`. Do not invent options.

## How Testeiya wires it

Read this before choosing between the app's built-in sync and a raw call.

### The target directory

Run from the workspace root and pass the dir with `-d` — never guess it. `resolveManualTestsDir(cwd)` decides:

- `.testeiya/manual-tests/` when it exists and holds markdown (a code repo with a pulled overlay).
- else the workspace root when ≥90% of files are `*.test.md` (a managed project workspace under `~/.testeiya/workspaces/<id>/`).
- else nothing is loaded yet — only a pull into `.testeiya/manual-tests` makes sense.

### What the buttons run

- Pull: `check-tests pull -d <dir> --force [--export-automated] [--suite-ids …]`.
- Push: `check-tests push -d <dir> [-f <changed files>]`.
- Uses the shipped bin, falling back to `npx -y check-tests@latest`, with a 120s timeout.
- Pushes only files changed since the last sync; background push-on-save pushes only suites that already carry an `@S` ID.

### The `--export-automated` rule

- Testeiya's pull adds `--export-automated` so automated tests come down as markdown references.
- Except in an automation repo (`hasAutomationConfig`: a playwright/codecept/cypress/wdio/testcafe/nightwatch/cucumber config or dependency) — there the spec files already are the automated tests, so markdown copies would duplicate them.
- Mirror this rule in raw calls.

### Token resolution

Mirror this order; never ask for a token before exhausting it:

1. The managed session's project token — in a single-project session it is already exported as `TESTOMATIO` (with `TESTOMATIO_URL`, `TESTOMATIO_PROJECT_ID`). Multi-project sessions leave `TESTOMATIO` unset; scope each call to one project's token.
2. The linked project's API key via the connected account (`.testeiya/testeiya.json` + stored auth).
3. The folder's own `.env` `TESTOMATIO`. check-tests auto-loads `.env` from its cwd.

### Built-in sync vs raw CLI

- Plain full pull/push of the current workspace → use the Pull/Push buttons (or replicate the invocation above). They handle dir, token, and change tracking.
- Raw CLI → when you need what the buttons don't expose: `--dry-run`, `--suite-ids`, ID cleanup, `TESTOMATIO_BRANCH`, labels, or a code import.
- First call in a session uses `npx check-tests@latest …`; later calls can drop `@latest`. Do not install it as a project dependency.

## Commands

### pull — Testomat.io → local markdown

Fetches `GET /api/test_data?with_files=true`, writes files under `-d`, creating dirs and overwriting.

| Flag | Meaning |
|---|---|
| `-d, --dir <dir>` | Target dir (default `.`). Always the resolved manual-tests dir |
| `--dry-run` | Preview created/overwritten files; writes nothing. Use before pulling over local edits |
| `--force` | Skip git safety checks. Testeiya always passes it for its managed dirs |
| `--export-automated` | Include automated tests as `type: automated` references. Omit in automation repos |
| `--suite-ids <ids>` | Pull only these suites, comma-separated: `--suite-ids "@S12345678,@S87654321"` |

Without `--force`, pull refuses to run when: the target is non-empty and not a git repo (`Directory is not empty and git is not initialized`); the git tree is dirty (`Git working tree is not clean`); or `TESTOMATIO` is missing. All exit 1.

### push — local markdown → Testomat.io

Shorthand for `check-tests manual '**/*.test.md' --update-ids`. It imports the markdown, waits for the server, then writes assigned IDs back (`N files updated.`). Expect a successful push to modify your files.

Push-specific flag:

- `-f, --files <files…>` — push only these files or globs (quote globs; paths resolve under `-d`). Prefer this when the changed files are known — e.g. output of `qa-write-test-cases` or `improve-test-cases`.

`--update-ids`/`--sync` are already implied — no need to pass them. Other flags come from [shared import flags](#shared-import-flags).

### framework import — automated code → Testomat.io

Parses test source (AST, no execution) and imports the found tests. Main Testeiya use: pairing an automation repo's specs with the manual cases — see `scan-automation-project` and `qa-e2e-tests-reporting`.

```bash
TESTOMATIO=<token> npx check-tests playwright "tests/**/*.spec.ts" --typescript --update-ids
```

- First positional = framework (case-insensitive): `playwright`, `codeceptjs` (alias `codecept`), `cypress` (alias `cypress.io`), `jest`, `vitest`, `mocha`, `jasmine`, `protractor`, `testcafe`, `qunit`, `nightwatch`, `newman`, `gauge`, `manual`, `webdriverio-mocha`. Unknown names fall back to the mocha parser.
- Second positional = a quoted glob, resolved inside `-d`.
- Without `TESTOMATIO`, it only lists the found tests and exits 0 — a handy parser dry-run.

Import-specific flags:

| Flag | Meaning |
|---|---|
| `--typescript` | `.ts`/`.tsx` sources. Needs `typescript` + `@typescript-eslint/typescript-estree`; the CLI prints the install line and exits 1 if missing |
| `--update-ids` | Write `@T`/`@S` IDs into titles after import (implies waiting). Auto-disabled when `TESTOMATIO_BRANCH` is set. On large repos, import once without it, then rerun with it |
| `--partial` | Import only `-d`'s tests into the matching folder without detaching anything outside it. Requires `-d`; equals `-d <dir>` + `TESTOMATIO_PREPEND_DIR=<dir>` |
| `--require-ids` | CI gate: exit 1 listing every non-skipped test missing an ID |
| `--no-skipped` | CI gate: exit 1 when skipped/exclusive tests exist |
| `--test-alias <names>` | Custom test-function names, comma-separated (`myTest,customIt`) |
| `-p, --plugins <plugins…>` | Extra Babel plugins for exotic syntax |
| `--no-hooks` | Strip before/after hook code from what's shown in Testomat.io |
| `--line-numbers` | Prefix code lines with their line numbers |
| `-g, --generate-file <file>` | Also write a markdown test-summary document |
| `-u, --url <url>` | GitHub base URL (`…/tree/main`) for source links |

### Shared import flags

Accepted by both `push` and framework import:

| Flag | Meaning |
|---|---|
| `-d, --dir <dir>` | Root the glob resolves in (default cwd) |
| `--sync` | Wait for the server to finish. Skip on very large imports (timeout risk) |
| `--create` | Create tests/suites for IDs present locally but missing in the project (moved from another project) |
| `--no-detached` | Don't mark tests absent from this import as detached. Required for any partial/subset import |
| `--no-empty` | Delete suites left empty after import. Conflicts with `--keep-structure` |
| `--keep-structure` | Force the local folder structure onto the project instead of preserving the project's |
| `--exclude <pattern>` | Glob to skip (`"**/node_modules/**"`) |
| `--force` | Skip git checks; also sends `force` to the import API |
| `--clean-ids` | **Destructive.** Remove this project's IDs from local files (needs `TESTOMATIO`). Confirm first |
| `--purge` / `--unsafe-clean-ids` | **Destructive.** Remove all `@T`/`@S`-shaped tags with no server check (no key needed) — may eat near-miss tags. Confirm first, verify titles after |

## Environment variables

Read by the CLI itself; a `.env` in the cwd is auto-loaded.

| Variable | Effect |
|---|---|
| `TESTOMATIO` | Project API key (`tstmt_…`). Required for any server call. Already exported in single-project sessions |
| `TESTOMATIO_URL` | Server base URL (default `https://app.testomat.io`). For self-hosted; Testeiya exports it with the token |
| `TESTOMATIO_BRANCH` | Import into a branch (matched by id, created if missing). Note: silently disables `--update-ids` |
| `TESTOMATIO_PREPEND_DIR` | Group imported tests under this folder (letters/digits/`-`/`_` only) |
| `TESTOMATIO_SUITE` | Import into an existing suite by SID (`1234567`, `S1234567`, or `@S1234567`) |
| `TESTOMATIO_WORKDIR` | Make file paths relative to this dir before sending (monorepos) |
| `TESTOMATIO_LABELS` | Comma-separated labels on every imported test; `label:value` supported. Alias `TESTOMATIO_SYNC_LABELS` |
| `TESTOMATIO_NO_DETACHED` | `.env` default equivalent of `--no-detached` |
| `DEBUG=testomatio:*` | Verbose logging for a failing run |

## Recipes

Run everything from the workspace root. `$TESTOMATIO`/`$TESTOMATIO_URL` are pre-exported in a single-project session.

```bash
# Managed project workspace (manual tests at the root)
npx check-tests@latest pull -d . --force --export-automated
npx check-tests push -d .

# Code repo with the .testeiya/manual-tests overlay
npx check-tests pull -d .testeiya/manual-tests --force --export-automated
npx check-tests push -d .testeiya/manual-tests

# Automation repo (specs ARE the automated tests — no --export-automated)
npx check-tests pull -d .testeiya/manual-tests --force

# Preview a pull before overwriting local edits
npx check-tests pull -d .testeiya/manual-tests --dry-run

# Pull only the named suites
npx check-tests pull -d .testeiya/manual-tests --force --suite-ids "@S12345678,@S87654321"

# Push exactly the files just written, without touching other suites
npx check-tests push -d .testeiya/manual-tests -f login.test.md checkout.test.md --no-detached

# Import Playwright specs and stamp IDs into the code
TESTOMATIO=<token> npx check-tests playwright "tests/**/*.spec.ts" --typescript --update-ids

# Import into a branch for review (IDs are not written back on a branch)
TESTOMATIO_BRANCH=dev TESTOMATIO=<token> npx check-tests codeceptjs "tests/**/*_test.js"
```

## The `*.test.md` format and ID round-trip

One file is one suite. Metadata lives in HTML comments; titles are headings:

```markdown
<!-- suite
id: @S12345678
-->

# Suite Title

<!-- test
id: @T12345678
priority: high
-->

## Test Title

Steps and expectations in plain markdown.
```

- Test keys: `id`, `type` (`manual`/`automated`; absent = manual), `priority` (`normal`/`high`/`low`), `assignee`, `creator`, `tags`, `labels`, `issues`, `shared`.
- Suite keys: `id`, `emoji`, `tags`, `labels`, `assignee`, `issues`. `tags`/`labels` are comma-separated.
- Suite `issues` are inherited by every test on push; suite `assignee` only by tests without their own.
- A new test needs no ID — a bare `<!-- test -->` line is enough; the first push expands it and inserts the `id:`.
- IDs match by exact title. A title edited between import and ID write-back gets no ID.
- `type` and `shared` are read-only exports — editing them locally has no effect on push.

## Exit codes and troubleshooting

Exit `0` = success, `1` = any failure (no code 2). A success exit with a failure message in the output is possible — always read the output.

| Symptom | Cause | Fix |
|---|---|---|
| `API key not provided` (push/import exits 0!) | No `TESTOMATIO` | Resolve the token per the order above; in multi-project sessions export the right one |
| `Directory is not empty and git is not initialized` / `Git working tree is not clean` (pull, exit 1) | Pull's git safety check | Commit first, or `--force` for Testeiya's own gitignored cache |
| `Can't find any tests in this folder` | Wrong `-d`/glob, or an unquoted glob eaten by the shell | Re-resolve the dir; quote the pattern |
| Push succeeds but a suite is missing | File lacks a valid `<!-- test -->` block before a `##`, or isn't `*.test.md` | Fix the block; pass the file via `-f` |
| Duplicate tests after push | An `id:` was edited or removed locally | Never touch IDs; use `--clean-ids` only for a deliberate fresh import |
| `--update-ids is disabled in a branch. Skipping…` | `TESTOMATIO_BRANCH` set | Expected; merge the branch, then rerun `--update-ids` off-branch |
| `--partial requires -d option` | `--partial` without `-d` | Add `-d <dir>` |
| `@babel/…` or TypeScript module error (exit 1) | `--typescript`/`--plugins` deps missing | Install what the message names |
| Import hangs/times out with `--sync` on a big repo | Server-side timeout | Drop `--sync`; import async, then `--update-ids` in a second run |
| HTTP error `(4xx: …)` | Bad/revoked token or wrong `TESTOMATIO_URL` | Verify the token and URL match `.testeiya/testeiya.json`; rerun with `DEBUG=testomatio:*` |

The CLI calls `GET /api/test_data` and `POST /api/load` directly — not through Testeiya's proxy, so they never appear in `cli/log/testomatio.http`. Use `DEBUG=testomatio:*` instead.

## Related skills

- `sync-test-cases-with-tms` — the pull/edit/push workflow that wraps this CLI. Use it for the process, this for the tool surface.
- `qa-write-test-cases` / `improve-test-cases` — produce and refine the `*.test.md` files; pass output via `push -f`.
- `scan-automation-project` — detect the framework before a code import.
- `qa-e2e-tests-reporting` / `testomatio-reporter` — report run RESULTS; check-tests imports definitions.
- `qa-test-code-coverage` — map source files to imported test IDs.
- `testomatio-mcp` — read/query the project over MCP instead of files.
- `check-cucumber` — the sibling importer for Gherkin `.feature` files.
