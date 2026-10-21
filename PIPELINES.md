# Pipeline file format

A pipeline is a QA flow in one YAML file: agent tasks and shell commands, run in
order, passing files through one folder. One command runs it:

```bash
testeiya pipeline <name|path.yml> [options]
```

This page is the reference for the file. The [README](README.md#pipelines) shows
how to use pipelines in CI.

## A complete example

```yaml
name: regression
description: Run the tests a change can break, then explain the failures.

summary: |
  Lead with failures this change caused. Flaky tests go last.

env:
  BASE_BRANCH: ${BASE_BRANCH:-origin/main}

gates:
  coverage:
    file: [coverage.tests.yml]
    message: No coverage.tests.yml. Create one with /qa-test-code-coverage.
  testomatio:
    env: [TESTOMATIO]
    message: No Testomat.io project. Set TESTOMATIO to the project's API key.
  local:
    run: test -z "$REMOTE"
    message: Tests run on the Testomat.io CI profile. No local log to read.
  test-command:
    env: [TEST_COMMAND]
    message: No test command. Set TEST_COMMAND, e.g. "npx playwright test".

when: [coverage]

stages:
  - id: tests
    when: [testomatio]
    run: |
      npx -y @testomatio/reporter run --kind detect --warn \
        --filter "coverage:file=coverage.tests.yml,diff=$BASE_BRANCH" \
        ${REMOTE:+--remote "$REMOTE"} ${TEST_COMMAND:+"$TEST_COMMAND"}
    timeout: 30m

  - id: failures
    when: [local, test-command]
    session: triage
    task: |
      Read the test run in tests.log. For each failure, say if this change caused it,
      if it is flaky, or if the test is out of date. /debug-fix-failed-flaky-autotests
      Fail the run if this change caused a failure.
    inputs: [tests.log]
```

## Top level

| Key | Required | Meaning |
|---|---|---|
| `name` | no | Shown in logs and `pipeline.json`. Default: the file name |
| `description` | no | One line, shown by `testeiya pipeline` |
| `summary` | no | Extra instructions for the final summary |
| `env` | no | Variables for every stage. Values expand `${NAME}` |
| `gates` | no | Named checks, defined once. See [Gates](#gates) |
| `when` | no | Gates for the whole run. One fails: nothing runs, exit 0 |
| `stages` | yes | The stages, run in order. At least one |

An unknown key is an error, found before anything runs.

## Stages

| Key | Meaning |
|---|---|
| `id` | Required. Lowercase words joined by dashes. Unique. Names the stage's files. `pipeline` and `summary` are reserved |
| `task` | An agent stage: the task text. `/skill` names expand |
| `run` | A command stage: a shell command, run with `sh` in the checkout |
| `when` | Gates this stage needs. One fails: the stage is skipped with its message |
| `session` | A named, persistent conversation. See [Sessions](#sessions) |
| `inputs` | Files the stage reads, from the pipeline folder |
| `outputs` | Files the stage must leave in the pipeline folder |
| `each_line` | Run once per non-empty line of this file. See [Loops](#loops) |
| `each_file` | Run once per file matching this mask |
| `stopOn` | `fail`, `gate`, or both as a list. See [Stopping](#stopping) |
| `timeout` | `90s`, `30m`, `1h`, or seconds. Per item in a loop. Default: none |

- A stage has exactly one of `task` or `run`.
- A stage has at most one of `each_line` or `each_file`.
- A list key also takes a single value: `when: staging` is `when: [staging]`.
- Explorbot, the reporter and test runners are plain `run` commands. They have
  no stage type of their own.

## Gates

A gate is a named check with a message. It is defined once under `gates:` and
named in `when:`, at the top level or in a stage.

```yaml
gates:
  staging:
    env: [EXPLORBOT_URL]
    message: No staging URL. Set EXPLORBOT_URL to test in a browser.
```

| Check | Passes when |
|---|---|
| `env: [A, B]` | every variable is set and not empty |
| `file: [path]` | every path exists, relative to the checkout |
| `run: <command>` | the command exits 0 within 30 seconds. Its output is hidden |
| `changes: {…}` | the changed files match, see [Changes](#changes) |

- A gate needs a `message` and at least one check. All its checks must pass.
- Every gate is checked once, before the first stage. `--dry-run` prints them all.
- A name in `when` that `gates` does not define is an error.
- `ai` is built in: a model and a provider key resolve. The summary needs it, so
  a pipeline without one exits 2 before anything runs.

### Gates from the CI job

The job can add a gate without editing the file:

```bash
testeiya pipeline regression --gate 'pr:test -n "$PR_NUMBER"'
```

- `--gate NAME:COMMAND` splits on the first colon. It is a `run` gate added to
  the top-level `when`.
- When it fails the whole run is skipped and exits 0.
- It is checked before `--output`, so `-o "gh:pr#$PR_NUMBER"` is fine when the
  number only exists when the gate passes.
- A name the file already defines is an error.

### Checking a pipeline

```bash
testeiya pipeline-check regression --set TEST_COMMAND="npx playwright test"
```

- Validates the file the way a run does, then checks every gate it declares,
  used or not, plus `ai` and any `--gate`.
- Prints each gate as passed or not, with its `message` when it does not pass.
- Runs no stage and spends no tokens. Takes `--set`, `--gate`, `--dir`, `--model`
  and `--json`.
- Exit code: `0` every gate passes, `1` one does not, `2` the file is invalid.

### Changes

```yaml
gates:
  api-changed:
    changes:
      paths: ["src/api/**", "openapi.yaml"]   # at least one changed file matches
      ignore: ["**/*.md", "**/*.lock"]        # these never count
      min_files: 3                            # at least this many count
    message: No API code changed.
```

Every key is optional. All given must hold, and at least one file must count.

- First round: the diff from the merge base with the target branch. The branch
  comes from `GITHUB_BASE_REF`, `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`,
  `BITBUCKET_PR_DESTINATION_BRANCH`, then `BASE_BRANCH`, then `origin/main`.
- Later rounds: the diff since the commit the last round ran on.
- Git cannot say (a shallow clone): a pipeline that uses `changes` exits 2.
  Check out with `fetch-depth: 0`.
- The list is written to `changes.txt` in the pipeline folder.

## Variables

- `${NAME}` and `${NAME:-default}` expand in `task`, `env`, `outputs` and gate
  values. Unset is empty. `run` goes to the shell, which uses the same rules and
  more, like `${NAME:+word}`.
- `--set KEY=VALUE` and the job's own environment reach every stage. `--set` wins
  over `env:`.
- The runner sets:

| Variable | Value |
|---|---|
| `PIPELINE_DIR` | absolute path of the pipeline folder |
| `PIPELINE_NAME` | the pipeline's name |
| `PIPELINE_ROUND` | 1, 2, … |
| `ITEM` | in a loop: the line, or the file's path |
| `ITEM_NAME` | in an `each_file` loop: the file name without its extension |
| `PIPELINE_RESUME` | `1` when a command stage is retried |

`TESTEIYA_FOLLOW_UP`, `TESTEIYA_THREAD` and `TESTEIYA_SESSION_FILE` are removed:
they belong to a single task.

## Files

Every stage runs in the checkout. Paths in `inputs`, `outputs` and loops resolve
against the pipeline folder, `$PIPELINE_DIR`. A path ending in `/` is a folder.

Each stage leaves its own files:

| File | Stage | Content |
|---|---|---|
| `<id>.md` | agent | the stage's report |
| `<id>.json` | agent | status, reason, tokens, session id |
| `<id>.log` | command | stdout and stderr |

- A later stage reads them by name: `inputs: [review.md]`.
- An `outputs` entry may not reuse one of these names.
- Every input must come from an earlier stage, from the runner (`changes.txt`),
  or exist in the folder at start.
- After a stage, every `outputs` entry must exist, or the stage is `broken`.
- An agent stage's task gets a block that names the folder, the files to read,
  the files to write, and inputs a skipped stage did not produce.
- A command stage whose inputs all come from skipped stages is skipped too. An
  agent stage still runs and is told what is missing.

## Loops

```yaml
- id: explore
  each_line: endpoints.txt
  run: npx -y explorbot api explore "$ITEM"

- id: sync
  each_file: test-cases/*.md
  task: Sync ${ITEM} to Testomat.io. /sync-test-cases-with-tms
```

- `each_line` runs once per non-empty line. `each_file` runs once per matching
  file, sorted, with `*` and `**`.
- Both resolve against the pipeline folder and are matched when the stage
  starts, so earlier stages can write them.
- Nothing to loop over: the stage is skipped.
- Items run one after another. A failed item does not stop the others. The stage
  takes the worst item's status.
- Each item writes `<id>.1.md`, `<id>.2.md`, … or `<id>.1.log`, …, joined into
  `<id>.md` or `<id>.log` at the end.
- An agent loop with a `session` runs every item in that conversation.

## Sessions

- `session: <name>` keeps the conversation in `.sessions/<name>.jsonl` in the
  pipeline folder.
- Stages with the same name share one conversation. Different names never see
  each other's reasoning, only each other's files.
- No `session`: a fresh conversation, saved nowhere.
- A session lasts as long as the folder. Kept between rounds, a stage on round 2
  continues its round 1 work.

## The summary

A pipeline with more than one stage ends with a summary. It is not written in
the file: the runner adds it.

- It runs the `pipeline-report` skill with the `summary:` text, reads every
  stage's files, and writes `summary.md`.
- Its report is the only thing sent to `--output`. Every other stage runs with
  `--no-thread` and posts nothing.
- It explains the pipeline's verdict and never changes it.
- It runs after the last stage, and after a stage that stopped the pipeline. Not
  after Ctrl-C, and not when the run was skipped.
- A one-stage pipeline has no summary. That stage's report is the report.

## Stopping

| Status | Agent stage | Command stage |
|---|---|---|
| `pass` | verdict pass | exit 0 |
| `fail` | verdict fail | non-zero exit |
| `broken` | crashed, or an `outputs` file is missing | an `outputs` file is missing |
| `timeout` | ran past `timeout` | same |
| `skipped` | a gate in `when` failed, or nothing to loop over | same, or its inputs were skipped |
| `not-run` | an earlier stage stopped the pipeline | same |

- `broken` and `timeout` always stop the pipeline.
- `stopOn: fail` stops it when this stage fails.
- `stopOn: gate` stops it when this stage is skipped by a gate.

Exit code: `0` pass or skipped, `1` any fail, broken or timeout, `2` bad usage
or no AI provider, `130` interrupted. `--exit-zero` forgives `fail` only.

## Rounds

Without `--dir` a pipeline runs once in a temp folder. Keep `--dir` between
runs, as a CI cache per pull request, and each run is a round:

| Folder holds | Same commit | New commit |
|---|---|---|
| nothing | round 1 | round 1 |
| a stopped round | retry from the stage that stopped | new round |
| a finished round | the same round again | new round |

- A retry keeps stages that passed or failed and uses the folder's copy of the
  file, so the stages cannot change half-way.
- A new round clears the last round's files, keeps `.sessions/`, and counts
  `changes` from the last round's commit. Stages with a session are told what
  changed. The summary updates its comment.
- `--dir` may not be the checkout or a folder above it.

`pipeline.json` in the folder holds the round, each stage's status and the
round history. `--json` prints it.

## In CI

Find what only the job knows in a step of its own, then run the pipeline in one
command:

```yaml
- name: Find pull request
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    gh api "repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/pulls" \
      --jq '.[0] // empty | "PR_NUMBER=\(.number)\nPR_TITLE=\(.title)\nPR_URL=\(.html_url)"' \
      >> "$GITHUB_ENV"

- name: Run regression
  env:
    TESTOMATIO: ${{ secrets.TESTOMATIO }}
    GH_TOKEN: ${{ github.token }}
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    TESTEIYA_MODEL: openrouter/anthropic/claude-haiku-4.5
  run: |
    npx -y testeiya@latest pipeline regression \
      --gate 'pr:test -n "$PR_NUMBER"' \
      --set REMOTE=github \
      --set BASE_BRANCH=${{ github.event.before }} \
      --set "TESTOMATIO_TITLE=PR #$PR_NUMBER $PR_TITLE" \
      --set "TESTOMATIO_DESCRIPTION=$PR_URL" \
      -o "gh:pr#$PR_NUMBER"
```
