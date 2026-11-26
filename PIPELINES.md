# Pipeline file format

A pipeline is a QA flow in one YAML file: agent tasks and shell commands, run in
order, passing files through one folder. One command runs it:

```bash
testeiya pipeline <name|path.yml> [options]
```

This page is the reference for the file. The [README](README.md#pipelines) shows
how to use pipelines in CI.

A pipeline file is a [scripted-yaml](https://github.com/DavertMik/scripted-yaml)
file. Four markers say what is not plain data:

| You write | It means |
|---|---|
| `key: text` | data; in text, each `{{ formula }}` is filled in |
| `key!: formula` | the value is one [FEEL](https://docs.camunda.io/docs/components/modeler/feel/what-is-feel/) formula |
| `key!name: value` | what runs: a stage's `run!task`, `run!sh`, `run!decide`, `run!extract`, or a check the runner makes (`$value!sh`, `$value!file`, `$value!changes`, `$value!decide`, `$value!extract`) |
| `$keyword:` | a word of the language: `$vars`, `$value`, `$functions`, `$extends`, `$tests` |

Its shape, the keys a pipeline may have, is
[`pipelines/pipeline.dsl.yml`](pipelines/pipeline.dsl.yml). Testeiya checks
every pipeline against it, so `$dsl: ./pipeline.dsl.yml` at the top of a file
is only for `npx scripted-yaml validate`.

## A complete example

```yaml
$dsl: ./pipeline.dsl.yml

name: regression
description: Run the tests a change can break, then explain the failures.
target: pr

summary: |
  Lead with failures this change caused. Flaky tests go last.

$vars:
  BASE_BRANCH: { default: origin/main }
  TESTOMATIO:  { optional: true, secret: true }

prerequisites:
  coverage:
    $value!file: [coverage.tests.yml]
    message: No coverage.tests.yml. Create one with /qa-test-code-coverage.
  testomatio:
    $value!: vars.TESTOMATIO != null
    message: No Testomat.io project. Set TESTOMATIO to the project's API key.
  local:
    $value!sh: test -z "$REMOTE"
    message: Tests run on the Testomat.io CI profile. No local log to read.
  test_command:
    $value!: vars.TEST_COMMAND != null
    message: No test command. Set TEST_COMMAND, e.g. "npx playwright test".

when!: prerequisites.coverage

stages:
  - id: tests
    title: Tests
    emoji: 🧪
    when!: prerequisites.testomatio
    run!sh: |
      npx -y @testomatio/reporter run --kind detect --warn \
        --filter "coverage:file=coverage.tests.yml,diff=$BASE_BRANCH" \
        ${REMOTE:+--remote "$REMOTE"} ${TEST_COMMAND:+"$TEST_COMMAND"}
    timeout: 30m

  - id: failures
    title: Failures
    emoji: 🐞
    when!: prerequisites.local and prerequisites.test_command
    session: triage
    run!task: |
      Triage the failures in tests.log without editing files. /debug-fix-failed-flaky-autotests
      Fail the run if this change caused a failure.
    inputs: [tests.log]

$tests:
  - about: Without a project the tests do not run
    vars: { TEST_COMMAND: npx playwright test }
    expect: { stages.tests.when: false }
```

## Top level

| Key | Required | Meaning |
|---|---|---|
| `$extends` | no | A bundled pipeline or a `.yml` path to patch. See [Extending a pipeline](#extending-a-pipeline) |
| `$vars` | no | Variables the file declares: a `default`, `secret: true`. See [Variables](#variables) |
| `$functions` | no | Formulas used more than once: `host(url)!: …`. See [Variables](#variables) |
| `$tests` | no | Checks of the formulas: `vars` in, `expect` out. See [Checking a pipeline](#checking-a-pipeline) |
| `name` | no | Shown in logs and `pipeline.json`. Default: the file name |
| `description` | no | One line, shown by `testeiya pipeline` |
| `target` | no | What starts it: `pr`, `issue`, `daily-cron`, `weekly-cron`, or your own word. `testeiya pipeline` groups by it. See [Targets](#targets) |
| `summary` | no | Extra instructions for the final summary. `{{ }}` is filled in |
| `env` | no | Variables for every stage: text, or `KEY!:` a formula |
| `packages` | no | npm packages the stages call, name to version. See [Packages](#packages) |
| `prerequisites` | no | Named checks, defined once. See [Prerequisites](#prerequisites) |
| `when!` | no | A formula: false skips the whole run, exit 0 |
| `stages` | yes | The stages, run in order. At least one |

A key the DSL does not know is an error, found before anything runs.

### Targets

`target` is free text, but a host acts on four words:

| Target | Started by |
|---|---|
| `pr` | a pull request opened or updated |
| `issue` | an issue opened |
| `daily-cron` | a schedule, once a day |
| `weekly-cron` | a schedule, once a week |

Any other word means the pipeline is started by hand. The list is exported as
`PIPELINE_TARGETS` from `testeiya/pipeline`.

## Stages

| Key | Meaning |
|---|---|
| `id` | Required. Lowercase words joined by dashes. Unique. Names the stage's files. `pipeline` and `summary` are reserved |
| `title` | The stage's heading in the final report. Default: the id, `browser-testing` is "Browser testing" |
| `emoji` | Shown before the title in the final report. Default: one picked from the id |
| `run` | Required. What the stage runs, said by its marker: |
| `run!task` | an agent's task. `{{ }}` is filled in, `/skill` names expand |
| `run!sh` | a shell command, run with `sh` in the checkout. No `{{ }}`: the shell reads variables |
| `run!decide` | `{ question, context, threshold }`: a yes or no for a decision model. Yes passes, no fails. See [Decisions and extractions](#decisions-and-extractions) |
| `run!extract` | `{ what, values }`: values an agent finds. See [Decisions and extractions](#decisions-and-extractions) |
| `when!` | A formula over prerequisites and variables. False: the stage is skipped with the message of the prerequisite that failed |
| `session` | A named, persistent conversation. See [Sessions](#sessions) |
| `inputs` | Files the stage reads, linked into its folder. See [Files](#files) |
| `outputs` | Files the stage must leave in its folder |
| `each_line` | Run once per non-empty line of this file. See [Loops](#loops) |
| `each_file` | Run once per file matching this mask |
| `stopOn` | `[gate]`: stop when this stage is skipped. See [Stopping](#stopping) |
| `continueOn` | `fail`: the stages after it run when it fails. The run still fails |
| `optional` | `true`: its fail, break or timeout neither stops the pipeline nor fails the run |
| `timeout` | `90s`, `30m`, `1h`, or seconds. Per item in a loop. Default: none |

- A stage has one `run`: `run!task`, `run!sh`, `run!decide` or `run!extract`.
- A stage has at most one of `each_line` or `each_file`.
- `inputs`, `outputs` and `stopOn` are lists: `inputs: [plan.md]`. File names
  are plain text, no `{{ }}`.
- Explorbot, the reporter and test runners are plain `run!sh` commands. They have
  no stage type of their own.

## Prerequisites

A prerequisite is a named check with a message. It is defined once under
`prerequisites:` and read in `when!:`, at the top level or in a stage, as
`prerequisites.<name>`. A name is lowercase words joined by underscores, so a
formula can read it: `explorbot_ai`, not `explorbot-ai`.

```yaml
prerequisites:
  staging:
    $value!: vars.EXPLORBOT_URL != null
    message: No staging URL. Set EXPLORBOT_URL to test in a browser.
```

Its `$value` is one of:

| Check | Passes when |
|---|---|
| `$value!: formula` | the formula is true. It reads variables (`vars.A != null and vars.B != null`) and other prerequisites (`prerequisites.staging and vars.CI = null`) |
| `$value!file: [path]` | every path exists, relative to the checkout |
| `$value!sh: <command>` | the command exits 0 within 30 seconds. Its output is hidden |
| `$value!changes: {…}` | the changed files match, see [Changes](#changes) |
| `$value!decide: {…}` | the decision model answers yes, see [Values and answers before the first stage](#values-and-answers-before-the-first-stage) |
| `$value!extract: {…}` | the agent finds every value, see [Values and answers before the first stage](#values-and-answers-before-the-first-stage) |

- A prerequisite needs a `$value` and a `message`. A `$value!extract` may leave
  the message out: it says which values were not found.
- Every check is made once, before the first stage. `--dry-run` prints them all.
- A formula that gives anything but true or false is an error when it is
  computed. `vars.NAME and …` is null when NAME is unset: compare with null,
  `vars.NAME != null`.
- Reading a prerequisite the file does not define is an error, found before
  anything runs.
- A `when!` that is false skips with the message of the first prerequisite it
  reads that did not pass. A `when!` that reads only variables says so instead.
- `ai` is built in: a model and a provider key resolve. The summary needs it, so
  a pipeline without one exits 2 before anything runs.

A variable is a secret when `$vars` says so. A host like Testeiya Hub hides its
value and keeps it in its vault, and a prerequisite that reads it is marked secret:

```yaml
$vars:
  TESTOMATIO: { optional: true, secret: true }

prerequisites:
  testomatio:
    $value!: vars.TESTOMATIO != null
    message: No Testomat.io project. Set TESTOMATIO to the project's API key.
```

### Values and answers before the first stage

A `$value!extract` prerequisite has the agent find values before the first
stage: the pull request, the commit, a deployment's url. `what` says what to
find and why; each key of `values` is a name and what the value is:

```yaml
prerequisites:
  git:
    $value!extract:
      what: The pull request under test. Use gh and git in this checkout.
      values:
        sha: sha of the commit under test
        pr: pull request number
        pr_url: pull request url
        branch: name of the branch

env:
  GIT_SHA!: prerequisites.git.sha

stages:
  - id: review
    when!: prerequisites.git != null
    run!task: Review {{ prerequisites.git.pr_url }} at commit {{ prerequisites.git.sha }}.
```

- The agent runs in the pipeline's process, as `testeiya extract` would, with
  its tools: `gh`, `git`, the shell. A value it cannot find fails the
  prerequisite; its message, when the file gives none, names what was not found.
- A formula reads a value as `prerequisites.git.sha`, in `when!`, in `env:` and
  in `{{ }}`. `prerequisites.git` is the map of values when every one was found,
  and null when one was not: `when!: prerequisites.git != null` runs a stage
  only with all of them. It is checked on every run, read in a `when!` or not.
- `{{ }}` is filled in in `what`, not in the descriptions of `values`.

A `$value!decide` prerequisite asks the decision model a yes or no question:

```yaml
prerequisites:
  ui_change:
    $value!decide:
      question: Does this diff change UI code or styles?
      context:
        sh: git diff --stat origin/main...HEAD
      threshold: 0.7
    message: No UI change, nothing to test in a browser.
```

- No stage has run yet, so its `context` takes `files` and `sh` only. See
  [Decisions and extractions](#decisions-and-extractions).
- A call that fails is a no: the prerequisite fails closed.

Both ask a model only for a run that goes on: after `--gate` and the top-level
`when!`, unless that `when!` reads them. `--dry-run` and `pipeline-check` ask
none: they show what a run would ask as pending, and count it as passing.

### Prerequisites from the CI job

The job can add a check without editing the file:

```bash
testeiya pipeline regression --gate 'pr:test -n "$PR_NUMBER"'
```

- `--gate NAME:COMMAND` splits on the first colon. It is a shell check made with
  the top-level `when!`.
- When it fails the whole run is skipped and exits 0.
- It is checked before `--output`, so `-o "gh:pr#$PR_NUMBER"` is fine when the
  number only exists when the check passes.
- A name the file already defines is an error.

### Checking a pipeline

```bash
testeiya pipeline-check regression --set TEST_COMMAND="npx playwright test"
```

- Validates the file the way a run does and runs its `$tests`, then checks every
  prerequisite it declares, used or not, plus `ai` and any `--gate`.
- Prints each prerequisite as passed or not, with its `message` when it does not pass.
- Runs no stage and spends no tokens: a `$value!decide` or `$value!extract` is
  pending. Takes `--set`, `--gate`, `--stage`, `--pipeline`, `--dir`, `--model`
  and `--json`.
- Exit code: `0` every prerequisite passes, `1` one does not, `2` the file is
  invalid or one of its `$tests` fails.
- `--diagram` also writes `<name>.diagram.md` to the current folder: a Mermaid
  chart of the stages in order, the files they pass on (dotted), and the prerequisites
  each one needs, green when it passes and red when it does not.

scripted-yaml checks the shape of a file without Testeiya. It finds the DSL
beside the file, so it suits the bundled pipelines and a copy of them that keeps
`pipeline.dsl.yml` next to it; a file that `$extends` a bundled pipeline by name
is for `testeiya pipeline-check`:

```bash
npx scripted-yaml validate pipelines/*.yml --markers sh,file,changes --computed task,decide,extract
npm run validate:pipelines      # the bundled ones, in this repository
```

`$tests` hold one case per branch of the formulas: the variables in, the values
out, as paths. A check the runner makes (`$value!sh`, `$value!file`,
`$value!changes`, `$value!decide`) reads as false in a test, and a `$value!extract` as null.

```yaml
$tests:
  - about: The issue names the Testomat.io branch
    vars: { ISSUE_URL: "https://github.com/org/repo/issues/42" }
    expect: { when: true, env.TESTOMATIO_BRANCH: org-repo-issues-42, stages.sync.when: false }
```

### Changes

```yaml
prerequisites:
  api_changed:
    $value!changes:
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

Every environment variable of the job, every `--set KEY=VALUE` and the runner's
own variables are `vars.NAME` in a formula and in `{{ }}`. Unset or empty is
null; `{{ vars.NAME }}` of null is empty text.

```yaml
$vars:
  BASE_BRANCH: { default: origin/main, about: What the change is compared with. }
  EXPLORBOT_AUTH: { optional: true, secret: true }

stages:
  - id: plan
    run!task: Plan a check of {{ vars.EXPLORBOT_URL }} against {{ vars.BASE_BRANCH }}.
```

- `$vars` declares a variable: its `default`, `secret: true`, an `about` for a
  UI. A default reaches every stage's shell too, so `$BASE_BRANCH` is
  `origin/main` when no one set it. Undeclared variables are read the same way.
- A declared variable with neither `optional: true` nor a `default` is required:
  a run without it is bad usage and exits 2, and `inputs()` lists it as required
  with its `about` as the message. A prerequisite, `$value!: vars.NAME != null`,
  skips with a message instead.
- `run!sh` goes to the shell as written: no `{{ }}`. The shell reads `$NAME`,
  `${NAME:-default}`, `${NAME:+word}`, with the same variables.
- `env:` sets variables for every stage. A value is text, or `KEY!:` a formula
  over `vars` and the other keys of `env`. A formula that gives null leaves the
  variable unset. `--set` wins over `env:`.

  ```yaml
  env:
    SITE!: replace(vars.STAGING_URL, "^[a-z]+://([^/]+).*$", "$1")        # staging.example.com
    PAGE!: slug(replace(vars.STAGING_URL, "^[a-z]+://[^/]*|[?#].*$", "")) # users-settings
    NAME!: env.SITE + "-" + env.PAGE
  stages:
    - id: explore
      run!sh: explorbot explore "$STAGING_URL" --output "$STAGE_DIR/$NAME"
  ```

- `$functions` names a formula a file uses more than once. FEEL has text
  functions (`replace`, `upper case`, `substring`, `string join`), and
  scripted-yaml adds one-word ones such as `slug`: `slug("feature/add-login")`
  is `feature-add-login`. A function of the file may not take a built-in's name.
- An unknown name or function is an error, so `pipeline-check` catches a typo.
- The runner sets:

| Variable | Value |
|---|---|
| `PIPELINE_DIR` | absolute path of the pipeline folder |
| `STAGE_DIR` | absolute path of the stage's own folder |
| `PIPELINE_NAME` | the pipeline's name |
| `PIPELINE_ROUND` | 1, 2, … |
| `GIT_BRANCH` | `GITHUB_HEAD_REF`, `CI_MERGE_REQUEST_SOURCE_BRANCH_NAME` or `BITBUCKET_BRANCH`, then the checked-out Git branch; empty for a detached local HEAD |
| `ITEM` | in a loop: the line, or the file's path |
| `ITEM_NAME` | in an `each_file` loop: the file name without its extension |
| `PIPELINE_RESUME` | `1` when a command stage is retried |

`TESTEIYA_FOLLOW_UP`, `TESTEIYA_THREAD` and `TESTEIYA_SESSION_FILE` are removed:
they belong to a single task. `TESTEIYA_MCP_SERVERS` is kept, so every agent stage
gets the same MCP servers.

## Decisions and extractions

A `run!decide` stage asks a decision model (TypeSafe's Jev, Cloudflare's Clef, …)
a yes or no question, the same as `testeiya decide`. Yes passes and no fails, so
a no stops the pipeline unless the stage is `optional` or has `continueOn: fail`.
A call that fails breaks the stage, it never reads as a no. The stage writes the
decision to `<id>.json` and one line to `<id>.md` for the summary.

```yaml
- id: worth-testing
  run!decide:
    question: Does this change touch anything a user can see in a browser?
    context:
      stages: review                          # review's report
      sessions: qa                            # the qa session's last answer
      files: [spec.md, "docs/*.md"]
      sh: git diff --stat origin/main...HEAD
    threshold: 0.7
```

| Key | Required | Meaning |
|---|---|---|
| `question` | yes | The yes or no question. `{{ }}` is filled in |
| `context` | no | What the model judges the question against |
| `threshold` | no | The probability of yes that counts as yes. Default: `0.5` |

The model has no tools: `context` is all it sees, each source one named block of
text. Each kind takes one entry or a list, and `{{ }}` is filled in:

| Kind | Gives |
|---|---|
| `stages` | an earlier stage's report, or its log for `run!sh`; a skipped stage says why |
| `sessions` | the last answer in a session of an earlier stage |
| `files` | files, in the stage's folder first, then in the checkout. A mask takes every file it matches, a folder its files |
| `sh` | what a command prints, run in the checkout with the stage's variables, within 30 seconds. One that fails says how |

- Without `context`, the stage's `inputs` are its context. A decide with
  neither is an error, as is a stage or a session that is not before it.
- The shape is in the DSL, so `npx scripted-yaml validate` catches a typo in it.
- The model is `TESTEIYA_DECISION_MODEL`, from the job or `--set`, never the
  pipeline's `--model`: that one is a chat model. `pipeline-check` and
  `--dry-run` check it under the `ai` gate. A `run!decide` stage takes no `session`.

A `run!extract` stage is an agent stage whose answer is values, the same as
`testeiya extract`. It finds them with its tools; `what` says what and why, and
it reads the stage's `inputs` too. It writes them to `<id>.values.json`, for a
later stage to read, and as `name: value` lines to `<id>.md`. When a value cannot
be found the stage fails and writes no values. It always runs in the pipeline's
process, even under `TESTEIYA_PIPELINE_SPAWN=1`.

```yaml
stages:
  - id: tests
    run!sh: npx playwright test --reporter=line > "$STAGE_DIR/results.txt"
    outputs: [results.txt]
    continueOn: fail
  - id: releasable
    run!decide:
      question: Did every test pass, with no test skipped for a known bug?
      context: { stages: tests }
      threshold: 0.8
  - id: preview
    run!extract:
      what: The preview deployment of this pull request. Its link is in a comment by the deploy bot.
      values:
        url: public url of the preview deployment
  - id: smoke
    run!sh: BASE_URL=$(jq -r .url "$STAGE_DIR/preview.values.json") npx playwright test smoke
    inputs: [preview.values.json]
```

A stage's values are files, not variables: a `when!` and the prerequisites are
computed before the first stage, so they cannot read what a stage found. Values
needed by a formula are a prerequisite's: see [Values and answers before the first stage](#values-and-answers-before-the-first-stage).

## Packages

`packages:` names the npm packages the stages call, each with a version, a range
or a tag. The runner installs them into `.packages/` in the pipeline folder once
per run, after the prerequisites pass. Every stage gets that folder as npm's
global prefix (`npm_config_prefix`) and its binaries first on `PATH`, so
`npx explorbot` and plain `explorbot` both run the installed copy:

```yaml
$vars:
  EXPLORBOT_VERSION: { default: latest }
packages:
  explorbot!: vars.EXPLORBOT_VERSION
  "@apidevtools/swagger-cli": ^4
stages:
  - id: explore
    run!sh: npx explorbot api explore /users
```

- A version is text, or a formula, so the job picks it: `EXPLORBOT_VERSION=0.6.0`.
- An empty value means `latest`, and a leading `@` is dropped: `@latest` works.
- Anything `npm install name@...` takes works: `file:../explorbot`, `github:org/repo`.
- Tags re-resolve every run, so `latest` is the newest release, never a stale cache.
- Prerequisite `$value!sh` checks run before the install and cannot call these binaries.
- A stage's `npm install --global` lands in `.packages/` too, not the machine's own prefix.
- A failed install stops the run before any stage. The npm log is
  `.packages/install.log`.

## Files

Every stage runs in the checkout and keeps its files in a folder of its own,
numbered in stage order, `$STAGE_DIR`. Open the folders in order to review a run:

```
.qa/
  pipeline.json
  changes.txt
  1-requirements/
    requirements.md
    requirements.json
  2-review/
    requirements.md    -> ../1-requirements/requirements.md
    review.md
    review.json
  3-explore/
    explore.log
    explorbot/
  summary/
    draft.md
    summary.md
```

- With 10 stages or more the numbers are padded: `01-review`, `02-check`.
- Hand a stage's report to the next one, `inputs: [requirements.md]`. Declare
  an extra output only when a command needs its format, like a list to loop
  over. Outputs are never part of the final report.
- When a skill fits, keep the task to two lines: what to work on, the skill,
  and where files go. The skill holds the method and the format.
- Paths in `inputs`, `outputs` and loops are relative to the stage folder. A
  path ending in `/` is a folder.

Each stage leaves its own files:

| File | Stage | Content |
|---|---|---|
| `<id>.md` | agent | the stage's report |
| `<id>.json` | agent | status, reason, tokens, session id |
| `<id>.log` | command | stdout and stderr |

- A later stage reads them by name: `inputs: [review.md]`.
- Before a stage runs, each input is linked into its folder, from the last
  earlier stage that wrote it or from the top of the pipeline folder. A command
  reads it as `"$STAGE_DIR/review.md"`. Stage numbers never appear in a path.
- An `outputs` entry may not reuse one of these names, nor be one of the stage's
  inputs. Write a new file.
- Every input must come from an earlier stage, from the runner (`changes.txt`),
  or exist in the pipeline folder at start.
- After a stage, every `outputs` entry must exist in its folder, or the stage is
  `broken`.
- An agent stage's task gets a block that names its folder, the files to read,
  the files to write, and inputs a skipped stage did not produce.
- A command stage whose inputs all come from skipped stages is skipped too. An
  agent stage still runs and is told what is missing.

## Loops

```yaml
- id: explore
  title: API exploration
  emoji: 🤖
  each_line: endpoints.txt
  run!sh: npx -y explorbot api explore "$ITEM"

- id: sync
  title: Sync to Testomat.io
  emoji: 🔄
  each_file: test-cases/*.md
  run!task: Sync {{ vars.ITEM }} to Testomat.io. /sync-test-cases-with-tms
```

- `each_line` runs once per non-empty line. `each_file` runs once per matching
  file, sorted, with `*` and `**`.
- Both resolve against the stage folder and are matched when the stage starts.
  The folder an `each_file` mask starts with, `test-cases/` here, counts as an
  input and is linked in from the stage that wrote it.
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

- The runner writes `summary/draft.md`: every stage's report, word for word,
  under its own section. Its headings move down to fit under the section.
- An agent then trims the draft into `summary/summary.md`. It drops what an
  earlier section already said and shortens sections that are too long. It
  never adds, renames or drops a heading, and never writes content of its own.
  The `summary:` text is passed to it.
- Its report is the only thing sent to `--output`. Every other stage runs with
  `--no-thread` and posts nothing.
- It lists every stage, in order, as its own section and nothing else:

  ```markdown
  ### 🧪 Tests

  <the stage's report>
  ```

- A skipped stage shows its prerequisite message. A stage that did not run says so.
- Stage reports are not signed. The summary is signed once.
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
| `skipped` | a prerequisite in `when` failed, or nothing to loop over | same, or its inputs were skipped |
| `not-run` | an earlier stage stopped the pipeline | same |

- A stage that fails, breaks or times out stops the pipeline. The stages after
  it are `not-run`, the summary still runs.
- `continueOn: fail` lets the stages after a failed stage run, as when the next
  stage triages failing tests. The run still fails. A break or timeout still stops it.
- `optional: true` marks a stage the run does not depend on, like a sync. Its
  fail, break or timeout does not stop the pipeline and does not count in the
  verdict. The summary says it ended badly.
- `stopOn: [gate]` stops it when this stage is skipped by a prerequisite.

```yaml
  - id: sync
    optional: true # a failed sync still reports the test cases
```

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
- A new round moves the last round's files to `.last/`, keeps `.sessions/`,
  and counts `changes` from the last round's commit.
- Each agent stage whose folder is in `.last/` is pointed at it and told to
  update that result: keep what still holds, redo what the changes touch. The
  summary is built from those updated reports and updates its comment.
- Stages match by folder name. A stage that moved gets no last round.
- `--dir` may not be the checkout or a folder above it.

`pipeline.json` in the folder holds the round, each stage's status and the
round history. `--json` prints it.

## Extending a pipeline

Change a pipeline without copying it. A file that starts with `$extends` is a
patch of another pipeline: it says what it changes and holds nothing else. It
runs by its path, and a bundled pipeline update reaches it.

```yaml
# .github/testeiya/issue-test-cases.yml
$extends: issue-test-cases

$vars:
  RELEASE: { optional: true }

prerequisites:
  $add:
    release:
      $value!: vars.RELEASE != null
      message: Not a release.

stages:
  $before:
    lint:
      title: Lint
      run!sh: npm run lint
      timeout: 5m

  requirements:
    $replace:
      run!task: Work out the requirements of {{ vars.ISSUE_URL }}. Never assume user credentials. Ask for them.

  sync:
    $replace:
      when!: base and prerequisites.release

  $after:
    notify:
      title: Notify
      when!: vars.SLACK_HOOK != null
      run!sh: curl -fsS "$SLACK_HOOK" -d "test cases for $ISSUE_URL are ready"
```

The result runs `lint`, `requirements`, `test-cases`, `sync`, `notify`.

Every change says what it does:

| Write | It does |
|---|---|
| `$replace: { key: value }` | overwrites keys that exist: `title`, `timeout`, `when!`, `run!sh`, `description` |
| `$add: { key: value }` | adds keys that do not exist yet: a prerequisite, a `timeout`, an `env` variable |
| `summary: { $after: text }` | adds text at the end of a text, on a new line; `$before` at the start. `description` and `message` too. A stage's `run` is replaced whole: `$replace: { run!task: … }` |
| `stages: { $before: { id: {…} } }` | adds stages, each under its id, before the first; `$after` after the last |
| `stages: { id: { $after: { new: {…} } } }` | adds a stage right after the stage `id`; `$before` right before it |
| `stages: { $remove: [id] }` | drops stages; `prerequisites: { $remove: [name] }` drops prerequisites; `$remove: [when]` drops a top-level key |
| `base` in a formula | the value it replaces: `when!: base and prerequisites.release` |

- Stages match by `id`, prerequisites by name. Reaching into a stage is a map
  under its id: `stages: { requirements: { … } }`.
- A plain key in a patch is an error: `timeout: 45m` under a stage must be
  `$replace: { timeout: 45m }`, or `$add` when the stage has none. A key the base
  does not have is an error too. So a typo, or a stage the base renamed, fails
  before anything runs.
- `$vars`, `$functions` and `$tests` are merged into the base's.
- `$extends` takes a bundled name (`issue-test-cases`) or a path relative to the
  file (`./base.yml`). A file named like a bundled pipeline extends the bundled one,
  so your `regression.yml` can start with `$extends: regression`.
- The base's `name` stays unless the patch replaces it: `$replace: { name: … }`.
- A patch can extend a patch. One that comes back to itself is an error.

### For one run: `--stage` and `--pipeline`

The command line takes the same patch:

```bash
testeiya pipeline issue-test-cases \
  --pipeline 'prerequisites: { $add: { release: { $value!: vars.RELEASE != null, message: Not a release. } } }' \
  --stage 'explore:$replace: { timeout: 45m }' \
  --stage 'sync:$replace: { when!: base and prerequisites.release }'
```

- `--stage ID:YAML` patches one stage. It splits on the first colon. Several
  changes go in one flow map: `--stage 'review:{$add: {timeout: 45m}, $replace: {title: Quick review}}'`.
- `--pipeline YAML` patches the pipeline, as a file under `$extends` does.
- The value is YAML, so quote text that holds `: `:
  `--stage 'plan:$replace: { run!task: "Note: be brief." }'`.
- Order: `$extends`, then every `--pipeline`, then every `--stage`, so a
  `--stage` can patch a stage a `--pipeline` added.
- The result is checked like any pipeline file, before anything runs. A mistake
  exits 2.
- `--dry-run` and `pipeline-check` print every override and the keys it changes.
- `pipeline.yml` in the folder holds the pipeline with `$extends` and every
  override applied: one file, `base` written out. A retry runs that copy, so it
  repeats the round it started.

### From the old format

A file in the format before scripted-yaml fails with the new spelling:

| Before | Now |
|---|---|
| `extends: name` + `append_task: …` | `$extends: name` + `$replace: { run!task: … }` |
| `task: <task>` | `run!task: <task>` |
| `decide: <question>` + `threshold:` | `run!decide: { question, context, threshold }` |
| `extract: <what>` + `format: ["url: …"]` | `run!extract: { what, values: { url: … } }` |
| `when: [a, b]` | `when!: prerequisites.a and prerequisites.b` |
| `run: <command>` | `run!sh: <command>` |
| prerequisite `env: [A, B]` | `$value!: vars.A != null and vars.B != null` |
| prerequisite `file:`, `run:`, `changes:` | `$value!file:`, `$value!sh:`, `$value!changes:` |
| prerequisite `secret: true` | `$vars: { A: { optional: true, secret: true } }` |
| `${NAME}` in a task | `{{ vars.NAME }}` |
| `${NAME:-x}` in `env:` | `$vars: { NAME: { default: x } }` |
| `${URL \| host}`, `\| slugify` | a FEEL formula, see [Variables](#variables) |
| `remove_stages: [id]` | `stages: { $remove: [id] }` |
| a prerequisite called `api-auth` | `api_auth` |
| `stopOn: gate` | `stopOn: [gate]` |

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

## Pipelines in your own code

`testeiya/pipeline` opens, checks and describes pipelines from their text. It
reads no file and imports nothing from Node, so it runs in a Worker or a browser
and checks a pipeline exactly as `testeiya pipeline-check` does: scripted-yaml
reads `$extends` and the DSL from memory there.

```js
import { Pipelines } from "testeiya/pipeline";

const pipelines = new Pipelines();               // the pipelines bundled with testeiya

pipelines.list();                                // [{ name: "regression", description, target: "pr", bundled: true, valid: true }, ...]
const pipeline = pipelines.open("regression");   // one of them, by name

pipeline.inputs();       // what a user can set: build the form from it
pipeline.stages();       // what runs, in order: build the stage view from it
pipeline.yaml();         // one YAML file to run: testeiya pipeline file.yml
```

Your own YAML goes through `parse`. It never throws, so call it on every
keystroke and ask for the errors:

```js
const pipeline = pipelines.parse(editorText, { name: "my-agent" });

for (const error of pipeline.errors()) {
  console.log(error.line, error.key, error.message);   // 7 "stages[1].when" "stage "two" when names prerequisite ..."
}
if (pipeline.isValid()) save(pipeline.yaml());
```

Your YAML can `$extends` any bundled pipeline. To extend your saved pipelines
too, and to list and open them, pass them in as name to YAML:

```js
const pipelines = new Pipelines({ "team-review": savedYaml, nightly: otherYaml });

pipelines.list();                                             // bundled and yours, by name
pipelines.open("nightly");
pipelines.parse("$extends: team-review\n", { name: "my-agent" });
```

**`Pipelines`**, the pipelines you can open and extend:

| Call | Returns |
|---|---|
| `new Pipelines(own?)` | The bundled pipelines, plus `own`: your pipelines as `{ name: yaml }` |
| `list()` | `{ name, description, target, bundled, valid }` for each, sorted by name. A broken one has `valid: false` and an empty description |
| `names()`, `has(name)` | The names `open` takes |
| `open(name)` | The `Pipeline` of that name. It throws a `PipelineError` when there is none |
| `parse(yaml, { name })` | A `Pipeline` from text. `name` is what you save it as. It becomes the pipeline's name when neither the YAML nor the pipeline it extends has a `name:` |

**`Pipeline`**, one pipeline:

| Call | Returns |
|---|---|
| `source` | The YAML as it was given |
| `errors()` | A list of `PipelineError`. Empty when the pipeline is valid |
| `isValid()` | `true` when there are no errors |
| `inputs()` | Every variable a user can set |
| `stages()` | The stages in order: `id`, `title`, `emoji`, `kind` (`task`, `run`, `decide`, `extract`), `text` (the task, command, question or `what`), `when`, `inputs`, `outputs`, `loop`; a decide stage's `decide` (`question`, `context`, `threshold`) and an extract stage's `extract` (`what`, `values`) |
| `prerequisites()` | The named checks: `message`, `scope`, `stages`, `env`, `checks` (`file`, `run`, `changes`, `decide`, `extract`), `secret` |
| `describe()` | All of the above with `name`, `description`, `target` and `summary`, as one plain object for JSON |
| `yaml()` | The YAML with `$extends` and overrides applied, `base` written out. It needs nothing else to run |
| `spec()` | The pipeline key for key, with defaults filled in |
| `override(yaml)`, `overrideStage(id, yaml)` | A copy with a [patch](#extending-a-pipeline) applied, as `--pipeline` and `--stage` do |

- Only `errors()` and `isValid()` work on a pipeline with a mistake. Every other
  call throws that `PipelineError`.
- A `PipelineError` has `message`, and `line` (1-based) and `key` (like
  `stages.two.when!`) when the problem has a place in the text. `errors()` has
  every problem scripted-yaml finds; the runner's own checks, like a duplicate
  stage id, stop at the first.
- `inputs()` lists the required inputs first: a variable a prerequisite of the
  top-level `when!` reads. Then the ones that unlock stages, in stage order. Then
  the rest by name: any `vars.NAME` a formula or `{{ }}` reads, `$NAME` a shell
  command reads, and what `$vars` declares. `default` is the `$vars` default.
  Each input has `name`, `required`, `default`, `message` (its prerequisite's
  message, for a hint), `secret`, `unlocks` (the stages skipped without it),
  `prerequisites` and `usedIn`.
- The runner's own variables (`BUILTIN_VARIABLES`), `HOME`, `PATH` and the keys of
  `env:` are never inputs. The exception is an `env:` value that reads its own name,
  like `BASE_BRANCH!: vars.BASE_BRANCH`.
- `stages()` gives each stage's `when` as the prerequisites it reads, also
  through other prerequisites, and `condition` as the formula written.
- Your own pipeline wins over a bundled one of the same name. Inside it,
  `$extends` with its own name means the bundled one, so your `regression` can
  start with `$extends: regression`.
- `$extends` that loops back, or names a pipeline that is not there, is an error.
- `PIPELINE_TARGETS` is the list of [targets](#targets) a host acts on.
- `ENVIRONMENT_VARIABLES` lists every variable Testeiya reads, such as
  `TESTEIYA_MODEL`, `TESTOMATIO` and `TESTEIYA_MCP_SERVERS`. Each entry has
  `name`, `group`, `description`, `flag` (the CLI option for the same setting)
  and `secret`. A host sets these on the run itself. They are not pipeline
  inputs, so `inputs()` lists one only when the pipeline reads it, like a
  prerequisite on `TESTOMATIO`.
