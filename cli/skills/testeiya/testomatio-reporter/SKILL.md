---
name: testomatio-reporter
description: Report automated test RESULTS to Testomat.io with @testomatio/reporter. Create and finish runs, merge parallel CI shards into one run, filter tests by tag/plan/label or coverage map, launch remote CI profiles, ingest JUnit XML and Allure, and upload S3 artifacts. Wired into Playwright, CodeceptJS, Cypress, Jest, Vitest, Mocha, WebdriverIO, Cucumber. Use to report results, create or finish a run, run tests with reporting, import JUnit/Allure, or debug missing results or artifacts.
license: MIT
metadata:
  author: Testomat.io
  version: 1.0.0
---

# Testomatio Reporter

`@testomatio/reporter` (npm, v2.x) reports automated test results to Testomat.io. It:

- creates runs and streams per-test statuses, steps, stack traces, and logs;
- uploads artifacts to the user's own S3 bucket;
- posts PR comments and writes local HTML/Markdown/CSV reports.

It targets the project identified by the `TESTOMATIO` key (`tstmt_*`).

The reporter writes RESULTS. `check-tests` and `check-cucumber` write test DEFINITIONS. "Report my results" or "create a run" is this tool; "sync my tests" is not.

## Use cases

- Report a Playwright/CodeceptJS/Cypress/Jest/… run's results to Testomat.io.
- Merge parallel CI shards into one run.
- Create a run now and finish it later, or launch its automated part on a CI profile.
- Run only the tests impacted by a diff via a coverage map.
- Ingest JUnit XML or Allure results from non-JS stacks.
- Upload screenshots/videos/traces as artifacts to S3.
- Debug missing results, duplicate runs, or missing artifacts.

## When NOT to use it

- **Running the reporter with a real key CREATES RUNS visible to the whole team.** Never run it "just to see if it works" — any create/finish/launch needs explicit authorization. Verify safely with the dry-run recipes below.
- **Never run the reporter over `*.test.md` files.** Nothing there is executable — markdown tests tagged `type: automated` are references, and the real code lives in a separate automation repo (executed via a CI profile, `run --remote`).
- Right tool only when the workspace IS an automation repo (a playwright/codecept/cypress/wdio config or dependency — Testeiya's `hasAutomationConfig`). Otherwise results come from CI or the automation repo.
- Setup/wiring → `qa-e2e-tests-reporting`. PR-driven CI pipelines → `setup-pr-testing`. Post-run analysis (history, flakiness) → `testomatio-mcp`. Coverage maps → `qa-test-code-coverage`. Test definitions → `check-tests`/`check-cucumber`.

## Testeiya workspace context

A workspace is a cwd representing one project (`.testeiya/testeiya.json` holds `{projectId, baseUrl, title}`). Three shapes:

| Workspace shape | Recognize by | Reporter applies? |
|---|---|---|
| Managed project workspace | `~/.testeiya/workspaces/<id>/`, `*.test.md` at root | Never — markdown only |
| Code repo with manual-tests overlay | `.testeiya/manual-tests/` holds `*.test.md` | Only if the repo itself is an automation repo; the overlay is never a target |
| Automation repo | playwright/codecept/cypress/wdio config or dep | Yes — the spec files are the automated tests |

Token resolution (mirror Testeiya's order): 1) the managed session's token for the slug; 2) else the linked project's `apiKey`; 3) else the folder's `.env` `TESTOMATIO`; 4) when `baseUrl` isn't `https://app.testomat.io`, also set `TESTOMATIO_URL`.

## Two usage modes

1. Framework reporter/plugin — wired into the runner's config. The runner executes tests; the adapter streams results whenever `TESTOMATIO` is set. Without the key the adapter stays inert, so committing the wiring is safe.
2. Standalone CLI — `npx @testomatio/reporter <command>`: manage the run lifecycle, wrap a runner so parallel workers report into one run, trigger remote CI profiles, or ingest XML/Allure.

- Both modes read the same `TESTOMATIO_*` env vars.
- Legacy bin aliases still work: `npx report-xml` (= `xml`), `npx start-test-run`.
- Yarn 4 (Berry) can't run scoped bins — install `testomatio-reporter-cli` and call `npx testomatio-reporter <command>`.
- **Truthy env vars are enabled by ANY value, including `false` and `0`.** To disable, unset the variable.

## CLI commands

`npx @testomatio/reporter <command> [options]`. Every command accepts `--env-file <file>` (default `.env`).

| Command | Purpose | Own options |
|---|---|---|
| `start` | Create a run, print its ID; non-zero if creation failed | `--kind`, `--filter`, `--format id` |
| `finish` | Finish a run (`TESTOMATIO_RUN`, else the stored latest) | — |
| `run` (alias `test`) | Create a run, execute `[command]` with `TESTOMATIO_RUN`/`TESTOMATIO_PROCEED` injected, finish by exit code; propagates the runner's exit code | `[command]`, `--filter`, `--filter-list`, `--format`, `--kind`, `--remote`, `--remote-param` |
| `xml <glob>` | Parse and upload JUnit/NUnit/xUnit/TRX reports | `-d`, `--lang <c#\|java\|ruby\|python\|php>`, `--java-tests [path]` (default `src/test/java`), `--timelimit <sec>` |
| `allure <glob>` | Parse and upload Allure results | `-d`, `--lang`, `--java-tests [path]` (default `src/test`), `--with-package`, `--timelimit <sec>` |
| `upload-artifacts` | Upload artifacts skipped/failed during the run (needs S3) | `--force` (re-upload done ones) |
| `replay [debug-file]` | Re-send from a debug file (default `./testomatio.debug.json`) | `--dry-run` (preview, no network) |

Shared option meanings (see sections below): `--kind` → [run kinds](#run-kinds); `--filter`/`--filter-list` → [filters](#filters); `--remote`/`--remote-param` → [remote launches](#remote-ci-launches); `--format` → machine-readable stdout.

### Machine-readable output (`--format`)

- With `--format`, stdout carries only the payload; the banner is skipped, logs go to stderr (`TESTOMATIO_LOG_LEVEL=INFO` brings progress back).
- `start --format id` → stdout is the run id: `RUN_ID=$(npx @testomatio/reporter start --format id)`.
- `run --filter-list … --format <v>` → matched IDs as `ids` (default), `grep` (`(T1|T2)`), `json`, or `newline`. Exit 0 if ≥1 matched, 1 if none — CI can branch on `$?`.

### Run kinds (`--kind`)

The flag follows which kinds of tests the project has:

| Project tests | `--kind` | Later launch |
|---|---|---|
| manual + automated | `mixed` | preview/merge launch the automated part |
| manual only | `manual` | none — complete at creation |
| automated only | *(omit)* | preview/merge launch the run |

### Filters

Only two filter pipes exist; any other prefix is rejected.

- `testomatio:` — `tag-name=smoke`, `plan=<id>`, `label=<name-or-id>` (`label=<id>:🔥 Major`), `jira-ticket=TC-123`. Execution filtering works for Playwright and CodeceptJS.
- `coverage:` — `file=<coverage.yml>[,diff=<git-ref>]`. Maps `git diff <ref> --name-only` (run in `process.cwd()`, default ref `master`) through a glob→ID map and returns impacted tests. The map is produced by `qa-test-code-coverage` (default `coverage.tests.yml`) — never hand-write one.
- A filter resolving to zero tests creates no run (`No tests found.`) — treat as success in CI.

### Remote CI launches (`run --remote`)

- `run --remote <profile>` asks Testomat.io to dispatch a CI profile (Settings → CI) instead of executing locally.
- The run is created, resolved filter IDs are joined with `|` as the workflow's grep, and the CLI exits 0 printing the run URL.
- With `TESTOMATIO_RUN` set, no new run is created — the profile triggers for the existing (prepared) run, reusing its stored scope unless a fresh `--filter` overrides it.
- `--remote-param <k=v>` forwards a parameter to the profile (repeatable) — the carrier for a preview URL.
- Guards: requires `TESTOMATIO` (exit 1); cannot combine with `--filter-list` (exit 1); a positional command is ignored with a warning; a missing profile fails `CI launch failed: <message>` (exit 1).
- Env equivalents: `TESTOMATIO_CI_PROFILE` (= `--remote`), `TESTOMATIO_CI_PARAMS="k=v,k2=v2"` (= `--remote-param`).
- Full CI phase model: `setup-pr-testing`.

## Environment variables

Confirmed against reporter v2.9.0. Reminder: boolean-style vars are enabled by any value, including `0`/`false`.

### Auth and target

| Variable | Meaning |
|---|---|
| `TESTOMATIO` | Project API key (`tstmt_*`). Aliases `TESTOMATIO_TOKEN`, `TESTOMATIO_API_KEY` are copied in when it's unset |
| `TESTOMATIO_URL` | Instance URL (default `https://app.testomat.io`). Set for self-hosted (match `.testeiya/testeiya.json` `baseUrl`) |

### Run identity

| Variable | Meaning |
|---|---|
| `TESTOMATIO_RUN` | Report into an existing run by ID |
| `TESTOMATIO_TITLE` | Run title |
| `TESTOMATIO_DESCRIPTION` | Run description; truncated to 1024 chars in PR comments |
| `TESTOMATIO_RUNGROUP_TITLE` | Attach to a RunGroup; `/` nests (`"Builds/${BUILD_ID}"`) |
| `TESTOMATIO_ENV` | Comma-separated environments (`"Windows, Chrome"`) |
| `TESTOMATIO_LABEL` | Run label(s); must exist with scope `runs`; `key:value`, comma-separated |
| `TESTOMATIO_JIRA_ID` | Link the run to a Jira issue (`TST-1`) |
| `TESTOMATIO_SHARED_RUN` | Parallel jobs report into one run matched by identical `TESTOMATIO_TITLE` |
| `TESTOMATIO_SHARED_RUN_TIMEOUT` | Minutes the shared-run title stays matchable (default 20) — after that a NEW run is created |
| `TESTOMATIO_PROCEED` | Keep the run Running; pair with an explicit `finish`. `run` sets it for its child automatically |
| `TESTOMATIO_PUBLISH` | Publish the run and get a public URL |
| `BUILD_URL` | Override the CI build URL (auto-detected on major CIs) |

### Reporting behavior

| Variable | Meaning |
|---|---|
| `TESTOMATIO_CREATE` | Create tests missing from the project (fallback — import first via `check-tests`) |
| `TESTOMATIO_WORKDIR` | Base dir for relative paths of created tests |
| `TESTOMATIO_SUITE` | Put created tests into a suite by ID (`@S12345678`); also on XML import |
| `TESTOMATIO_UPDATE_CODE` | Send test source with each run (off by default — code is pushed by `check-tests`) |
| `TESTOMATIO_MARK_DETACHED` | XML only: mark project tests absent from this run as detached; pass a tag to limit |
| `IGNORE_NEW_TESTS` | XML only: don't create unmatched tests |
| `TESTOMATIO_EXCLUDE_FILES_FROM_REPORT_GLOB_PATTERN` | Exclude report files by glob; `;`-separated |
| `TESTOMATIO_EXCLUDE_SKIPPED` | Drop skipped tests from the report |
| `TESTOMATIO_NO_TIMESTAMP` | Disable auto timestamps (unsynced parallel clocks) |
| `TESTOMATIO_INTERCEPT_CONSOLE_LOGS` | Capture console output into test logs |
| `TESTOMATIO_STACK_PASSED` | Include stacks/logs for passed tests |
| `TESTOMATIO_STACK_IGNORE` | Glob of files to omit from stack traces |
| `TESTOMATIO_STACK_ARTIFACTS` | Store oversized stacks (>5000) and steps (>10000) as artifact files |
| `TESTOMATIO_STEPS_PASSED` | Include step details for passed tests |
| `TESTOMATIO_NO_STEPS` | Report no steps at all |
| `TESTOMATIO_SCREENSHOTS_ON_STEPS` | Step-screenshot upload (on where available; set `false` to disable — this one parses the value) |
| `TESTOMATIO_DISABLE_BATCH_UPLOAD` | One request per result instead of batches |
| `TESTOMATIO_REQUEST_TIMEOUT` | API timeout in ms (default 20000) |
| `TESTOMATIO_MAX_REQUEST_FAILURES` | Stop reporting after N failed requests |
| `TESTOMATIO_MAX_REQUEST_FAILURES_COUNT` | Max total retries (default 10) |
| `TESTOMATIO_MAX_REQUEST_RETRIES_WITHIN_TIME_SECONDS` | Retry window in seconds (default 60) |
| `TESTOMATIO_MAX_ENTITY_EXPANSIONS` | XML entity-expansion cap (default 10000); raise only for trusted reports |
| `TESTOMATIO_LOG_LEVEL` | `ERROR` / `WARN` / `INFO` (default) |
| `TESTOMATIO_DEBUG` | Debug pipe: full request logging + a replayable `testomatio.debug.json` (plain `DEBUG` also triggers it) |
| `HTTP_PROXY` / `HTTPS_PROXY` | Route API requests through a proxy |

### Artifacts (S3)

Artifacts upload to the user's own S3-compatible bucket, never to Testomat.io. Uploads activate when `S3_BUCKET` is set (env or Project Settings → Artifacts). Public `public-read` by default; private mode uses 10-minute pre-signed links.

| Variable | Meaning |
|---|---|
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Bucket credentials |
| `S3_BUCKET` / `S3_REGION` | Bucket name and region |
| `S3_ENDPOINT` | Endpoint URL — required for non-AWS (DigitalOcean, Minio, R2, GCS) |
| `S3_FORCE_PATH_STYLE` | Path-style URLs — `true` for Minio/R2; keep off on AWS or pre-signed private links break |
| `S3_SESSION_TOKEN` | Temporary-credentials session token |
| `TESTOMATIO_PRIVATE_ARTIFACTS` | Private upload mode; mirror S3 creds in Project Settings → Artifacts so the app can pre-sign |
| `TESTOMATIO_DISABLE_ARTIFACTS` | Skip uploads during the run; recover later with `upload-artifacts` |
| `TESTOMATIO_ARTIFACT_MAX_SIZE_MB` | Skip files over N MB during the run; upload them afterwards |

For non-JS stacks, artifacts attach by printing `file://<path>` to output (picked up from JUnit `system-out`). `tid://@T<id>` links a result to an existing test.

### CI pipes and local reports

Each pipe activates on its env var alone. HTML/Markdown/CSV pipes need NO key — useful for local-only reports. PR comments always come from these pipes; never script a PR-comment API call.

| Variable | Meaning |
|---|---|
| `GH_PAT` | GitHub PR comment (in Actions, `${{ github.token }}` works; needs `issues: write`, `pull-requests: write`) |
| `GH_KEEP_OUTDATED_REPORTS` / `GITHUB_REMOVE_ALL_OUTDATED_REPORTS` | Keep / delete previous PR comments (note the asymmetric prefixes — both real) |
| `GITLAB_PAT` | GitLab MR comment (`api` scope; MR pipeline context) |
| `GITLAB_KEEP_OUTDATED_REPORTS` / `GITLAB_REMOVE_ALL_OUTDATED_REPORTS` | Same for GitLab |
| `BITBUCKET_ACCESS_TOKEN` | Bitbucket PR comment (repo token; only in `pull-requests:` pipelines — needs `BITBUCKET_PR_ID`) |
| `BITBUCKET_KEEP_OUTDATED_REPORTS` / `BITBUCKET_REMOVE_ALL_OUTDATED_REPORTS` | Same for Bitbucket |
| `TESTOMATIO_HTML_REPORT_SAVE` / `_FOLDER` / `TESTOMATIO_HTML_FILENAME` | Local HTML report (default `html-report/testomatio-report.html`) |
| `TESTOMATIO_MARKDOWN_REPORT_SAVE` / `_FOLDER` / `TESTOMATIO_MARKDOWN_FILENAME` | Local Markdown report (default `md-report/…`; feed `$GITHUB_STEP_SUMMARY`) |
| `TESTOMATIO_CSV_FILENAME` | Local CSV report |

## Framework wiring

Full setup (detection, install, credentials) lives in `qa-e2e-tests-reporting`. The wiring surface for reference:

| Framework | Wiring |
|---|---|
| Playwright | `reporter: [['list'], ['@testomatio/reporter/playwright', { apiKey: process.env.TESTOMATIO }]]` |
| CodeceptJS | plugin `testomatio: { enabled: true, require: '@testomatio/reporter/codecept' }`; local reports via `html`/`markdown`/`csv`/`reportDir` |
| Cypress ≥10 | `setupNodeEvents(on, config) { return require('@testomatio/reporter/cypress')(on, config) }`; filtering needs `@cypress/grep` |
| Jest | `reporters: ['default', ['@testomatio/reporter/jest', { apiKey: process.env.TESTOMATIO }]]`; never use `bail` |
| Vitest | `reporters: ['verbose', new TestomatioReporter()]` (from `@testomatio/reporter/vitest`); sent after the run ends |
| Mocha | `mocha --reporter @testomatio/reporter/mocha --reporter-options apiKey=$TESTOMATIO` |
| WebdriverIO | `reporters: [[testomatio, { apiKey: process.env.TESTOMATIO }]]` (`@testomatio/reporter/wdio`); wrap with `reporter run` for parallel |
| Cucumber-js | `npx cucumber-js --format @testomatio/reporter/cucumber` (features imported first via `check-cucumber`) |
| Jasmine / Protractor | `new JasmineReporter({ apiKey })` from `@testomatio/reporter/jasmine` |
| Nightwatch | `npx nightwatch --reporter @testomatio/reporter/nightwatch` |
| TestCafe | `npx testcafe chrome -r testomatio` |
| Newman | `newman-reporter-testomatio`, then `newman run … -r testomatio` |
| Java/Python/Ruby/PHP/C#/Go | generate JUnit XML → `xml`; or Allure results → `allure` |

```bash
# Playwright, reporter wired in config
TESTOMATIO=tstmt_*** npx playwright test

# CodeceptJS with parallel workers — wrap so all workers hit one run
TESTOMATIO=tstmt_*** npx @testomatio/reporter run 'npx codeceptjs run-workers 2'

# Pytest via JUnit XML
pytest --junit-xml report.xml
TESTOMATIO=tstmt_*** npx report-xml report.xml --lang=python
```

## Run lifecycle recipes

All of these create or mutate runs — authorized use only.

Plain report — reporter wired into the runner, `TESTOMATIO` set, run the tests. The run is created on the fly and finalized when the runner exits.

```bash
# Parallel CI shards into one run — same unique title on every shard + shared-run matching
TESTOMATIO=tstmt_*** TESTOMATIO_TITLE="report for ${GIT_COMMIT}" \
TESTOMATIO_SHARED_RUN=1 TESTOMATIO_SHARED_RUN_TIMEOUT=120 npx playwright test --shard=1/4

# Prepared run, launched later (the setup-pr-testing two-phase contract)
RUN_ID=$(npx @testomatio/reporter start --kind mixed \
  --filter "coverage:file=coverage.tests.yml,diff=origin/main" --format id)
TESTOMATIO_RUN=$RUN_ID npx @testomatio/reporter run --remote github

# Selective execution from a coverage map
npx @testomatio/reporter run "npx playwright test" --filter "coverage:file=coverage.tests.yml,diff=develop"
# or resolve IDs yourself:
GREP=$(npx @testomatio/reporter run --filter-list "coverage:file=coverage.tests.yml" --format grep)
[ -n "$GREP" ] && npx playwright test --grep "$GREP"

# JUnit / Allure ingestion
TESTOMATIO=tstmt_*** npx @testomatio/reporter xml "target/surefire-reports/**.xml" --java-tests
TESTOMATIO=tstmt_*** npx @testomatio/reporter allure allure-results

# Deferred artifact upload (slow uplinks, or big files only)
TESTOMATIO=tstmt_*** TESTOMATIO_ARTIFACT_MAX_SIZE_MB=10 npx playwright test
TESTOMATIO=tstmt_*** npx @testomatio/reporter upload-artifacts
```

- Shard alternative without title matching: one job runs `start --format id`, exports the id, every shard runs with `TESTOMATIO_RUN=$RUN_ID TESTOMATIO_PROCEED=1`, a final job runs `finish`.
- `xml` links results via `@T<id>` in test names, `// @T<id>` in reachable source, or `tid://@T<id>` in output. `allure` also maps `@TmsLink` annotations.

Safe verification without touching the project (allowed without authorization — no network writes):

```bash
# local-only report: no key, markdown pipe on
TESTOMATIO_MARKDOWN_REPORT_SAVE=1 npx playwright test
# or capture what WOULD be sent, then preview
TESTOMATIO_DEBUG=1 npx playwright test        # writes ./testomatio.debug.json
npx @testomatio/reporter replay --dry-run     # previews, sends nothing
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| No run appears, no errors | `TESTOMATIO` not visible to the runner (subshell, missing dotenv load, unmapped CI secret). Check with `DEBUG=@testomatio/reporter:*`. Resolve the token per the order above |
| `TESTOMATIO is "undefined"` | The literal string `undefined` was interpolated — fix the shell/CI expansion |
| Two runs instead of one on parallel | Shard titles differ, `TESTOMATIO_SHARED_RUN` unset, or the window (default 20 min) elapsed — align `TESTOMATIO_TITLE`, raise the timeout. For runner-spawned workers, wrap with `reporter run` |
| A "disable" var didn't disable | Boolean vars enable on any value including `false`/`0` — unset them |
| Run stuck as Running | `TESTOMATIO_PROCEED` set without a `finish` — run `TESTOMATIO_RUN=<id> npx @testomatio/reporter finish` |
| `$(...)` output polluted by the banner | Add `--format` — only then is stdout clean |
| `--filter` rejected | Only `testomatio:` and `coverage:` pipes exist; check the prefix |
| `Coverage file not found` / `Git command failed` / `Missing required parameter: "file"` | The pipe reads the map with `fs` and runs `git diff` in the cwd — run from inside the repo, verify path/ref (shallow clones need full history) |
| `CI launch failed: No settings for <profile>` | The `--remote` profile doesn't exist — check Settings → CI (or `/api/v2/<project>/info` `ci_profiles`) |
| Artifacts missing | S3 env not set where tests ran (Docker: pass `-e`), `TESTOMATIO_DISABLE_ARTIFACTS` on, or files over the size cap — recover with `upload-artifacts --force` |
| Private artifacts upload but don't display | `S3_FORCE_PATH_STYLE=true` on AWS breaks pre-signed URLs — set `false`; avoid dots in bucket names; mirror creds in Project Settings |
| XML: `Entity expansion limit exceeded` | Trusted report with heavy entities — raise `TESTOMATIO_MAX_ENTITY_EXPANSIONS` |
| XML/Allure import hangs in CI | Network stall — add `--timelimit <sec>`; it kills with exit 0 so the pipeline isn't failed |
| Bitbucket comment hits `/pullrequests//comments` | Not a PR pipeline — `BITBUCKET_PR_ID` absent; only under `pipelines: pull-requests:` |
| Jest run status never updates | `bail` is set in the Jest config — remove it |
| Results lost after a flaky upload | Rerun with `TESTOMATIO_DEBUG=1`; recover a debug file with `replay` (history in `/tmp/testomatio.debug.<datetime>.json`) |

## Related skills

- `check-tests` / `check-cucumber` — import and sync test DEFINITIONS (the other side of the boundary).
- `qa-e2e-tests-reporting` — the setup workflow that installs and wires this reporter.
- `setup-pr-testing` — PR-driven CI pipelines built on prepared runs and `--remote`.
- `qa-test-code-coverage` — produces the `coverage.tests.yml` consumed by `--filter "coverage:…"`.
- `scan-automation-project` — discovers whether a workspace is an automation repo.
- `debug-fix-failed-flaky-autotests` — acting on the failures a run reports.
- `testomatio-mcp` — reading and analyzing runs after they exist.
