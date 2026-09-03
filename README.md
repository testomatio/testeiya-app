<p align="center">
  <img src="https://raw.githubusercontent.com/testomatio/testeiya-app/main/assets/testeiya-cli-logo.png" alt="Testeiya" width="220">
</p>

# Testeiya

[![npm](https://img.shields.io/npm/v/testeiya)](https://www.npmjs.com/package/testeiya)
[![licence](https://img.shields.io/npm/l/testeiya)](LICENSE)

An agent, app, and the goddess of testing.

Testeiya is an autonomous QA agent. It reacts to triggers — a pull request, a new
issue, a failed test run, a deploy — runs exactly one analysis, and delivers its
verdict where your team works: a PR comment, a markdown report, or a Testomat.io
project. There is no interactive mode and no human in the loop. That is the point:
you wire it into CI once, and every event that should get QA thinking gets it.

It ships as a desktop app, a web app, and the command-line agent in this repository.

| Folder | What it is |
|---|---|
| `prompt/` | System-prompt fragments: the agent's role, rules, tool guidance, Testomat.io operating rules, and the report contract |
| `skills/` | The manifest of skills the agent can invoke. Every folder is fetched from its own upstream repository |
| `src/` | The `testeiya` command-line agent (Node) |

The desktop and web harness is not open source. That covers the servers, session management, sync, and UI.

## Install

Requires Node 22.19 or newer, an LLM provider key, and a model.

```bash
npx testeiya doctor
```

`doctor` reports which key won, which skills loaded, and whether Testomat.io is reachable — without spending a token.

The key comes from the environment (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `GEMINI_API_KEY`), from `~/.testeiya/.env`, or from
`~/.testeiya/auth.json`. That last file is the one the desktop app's Settings
dialog writes, so configuring it once covers both.

There is no default model. Name one with `--model <provider>/<id>` or
`TESTEIYA_MODEL`. CI usually has neither set, so a run that resolves no model
exits `2` rather than picking one for you.

```bash
export TESTEIYA_MODEL=openrouter/anthropic/claude-sonnet-5
testeiya models anthropic   # list what your key can reach
```

## How it runs

```bash
testeiya task "<task>"     # run one task, deliver a report, exit
testeiya ask "<question>"  # answer a question, no report
testeiya skills            # list the skills bundled with this package
testeiya sessions          # list saved sessions for this folder
```

The agent runs one task and exits. Progress goes to stderr, so a run drops into CI as-is:

| Exit code | Meaning |
|---|---|
| `0` | pass, or a positive verdict from the agent |
| `1` | failed run, or a negative verdict — findings that need a human |
| `2` | bad usage |
| `130` | interrupted |

Pass `--exit-zero` when a negative verdict must not fail the job. A broken run
still exits `1`, bad usage still exits `2`, and the verdict is still in the
report and in the run envelope for anything that wants to gate on it.

A task can come from stdin too:

```bash
cat issue-42.md | testeiya task --output report.md
```

Every command takes `--json` for machine-readable output of the run envelope
(verdict, reason, tokens, session id). `testeiya --help` lists all options;
`testeiya help` is the full guide.

## Scenarios

Each scenario below is a single unattended run. Nobody answers questions; the
agent reads what the trigger gives it and acts on its own judgement. If its
verdict is negative, the job fails — that failure *is* the signal.

### Grill a pull request

Every PR gets a QA review before merge. The agent loads the branch's diff,
analyzes it through the `qa-thinking` skill — edge cases, negative flows,
abuses, data-consistency risks — and posts the findings as a PR comment:

```bash
git fetch origin "$PR_BRANCH"
git checkout "$PR_BRANCH"
testeiya task "Review this pull request as a QA engineer. What could go wrong?" \
  --output gh:pr-comment --output review.json
```

Exit code `1` means the agent found real risk, so you can gate the merge on it.

### Write test cases from a pull request

Same trigger, different deliverable: the `qa-write-test-cases` skill turns the
change into test cases in Testomat.io markdown format, written as a build
artifact ready to commit or import:

```bash
testeiya task "Create test cases covering the changes in this pull request" \
  --output testcases/
```

With `TESTOMATIO` and the project id set, add
`sync them to Testomat.io` to the task and they land straight in the TMS via
`sync-test-cases-with-tms`.

### Create test cases from a new issue

A requirements text arrives from the issue tracker — piped in, no human
summarizing it first. The agent writes a checklist and test cases from it:

```bash
gh issue view 57 --json title,body -q '.title + "\n\n" + .body' \
| testeiya task --output testcases/issue-57.md
```

### Explore a deployed app with Explorbot

After a deploy, point [Explorbot](https://github.com/testomatio/explorbot) — the
autonomous browser-testing CLI the agent drives through the `explorbot-*`
skills — at the staging URL. It researches, plans, and tests the live app in
its own browser, then reports what broke:

```bash
testeiya task "Run explorbot against https://staging.example.com, max 10 tests, report failures" \
  --output explorbot-report.md
```

### Repair failing tests after a red build

On a failed CodeceptJS run, the `ci-fix-tests` skill attempts safe fixes only —
locator drift, missing waits — reruns just the failing scenarios, rolls back any
edit that did not help, and always writes `output/ci-fix.md` for the next job:

```bash
testeiya task "Fix the failed CodeceptJS tests using ci-fix-tests. No refactors."
```

### Audit the test suite on a schedule

Nightly, the agent walks the Testomat.io project and reports gaps — suites with
no tests, cases gone stale against the current code, coverage holes:

```bash
TESTOMATIO=tstmt_xxx testeiya task \
  "Audit this project: which suites have no automated tests, and which manual cases look automatable?" \
  --output audits/$(date +%F).md
```

## CI setup

Testeiya needs three things in any CI system: a provider key, a model name, and
the checkout of whatever the task reads. Everything else is standard.

### GitHub Actions

GitHub runners ship the [GitHub CLI](https://cli.github.com), so posting back to
the PR is one flag. `GITHUB_TOKEN` authenticates it; keep the LLM key in
repository secrets.

```yaml
name: qa-review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read

jobs:
  grill:
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: ${{ github.token }}
      OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      TESTEIYA_MODEL: openrouter/anthropic/claude-sonnet-5
      # optional, for scenarios that touch Testomat.io
      TESTOMATIO: ${{ secrets.TESTOMATIO }}
      TESTOMATIO_PROJECT_ID: my-project
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx testeiya@latest doctor
      - run: |
          npx testeiya@latest task \
            "Review this pull request as a QA engineer. What could go wrong?" \
            --output gh:pr-comment --output review.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: review
          path: review.json
```

The same shape works for the other scenarios: trigger on `issues` and pipe the
body in for test-case generation, or run on a `schedule` for the nightly audit.

To let reviewers answer in the thread, add `issue_comment` to the triggers, sign
the report with a line that says how to reply, and hand the comment body to the
run as a follow-up:

```yaml
on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  grill:
    if: >-
      github.event_name == 'pull_request' ||
      (github.event.issue.pull_request &&
       startsWith(github.event.comment.body, '/testeiya'))
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: ${{ github.token }}
      TESTEIYA_FOLLOW_UP: ${{ github.event.comment.body || '' }}
      PR: ${{ github.event.number || github.event.issue.number }}
    steps:
      # full history, so the round can diff against the commit the last one saw
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      # a comment event checks out the default branch, so move to the pull request
      - run: gh pr checkout $PR
      # the session lives here; without this every round starts empty
      - uses: actions/cache/restore@v4
        with:
          path: ~/.cache/testeiya
          key: testeiya-pr-${{ env.PR }}-${{ github.run_id }}
          restore-keys: testeiya-pr-${{ env.PR }}-
      - run: |
          npx testeiya@latest task \
            "Review this pull request as a QA engineer. What could go wrong?" \
            --session-file ~/.cache/testeiya/pr-$PR.jsonl \
            --footer "> Reply to this comment starting with /testeiya" \
            --output gh:pr-comment
      # save even when the verdict failed the job — that is the round people reply to
      - uses: actions/cache/save@v4
        if: always()
        with:
          path: ~/.cache/testeiya
          key: testeiya-pr-${{ env.PR }}-${{ github.run_id }}
```

`issue_comment` fires on issues as well as pull requests and always runs the
default branch's copy of the workflow, against the default branch's code. The
`github.event.issue.pull_request` check and the `gh pr checkout` step above are
what keep an answer on the right code. Gate the trigger on the author too: every
comment spends tokens.

Two details are load-bearing. The cache is split because `actions/cache` saves
in a post step that a failed job never reaches, and a negative verdict fails the
job — so the round a reviewer is most likely to answer would be the one that
saved no session. Add `--exit-zero` instead if you would rather the verdict live
only in the comment and never red the job. And the key carries `github.run_id`
with a `restore-keys` prefix, because a cache entry is never overwritten: a
fixed key would save the first round and restore it forever, in a green job that
looks fine.

### GitLab CI

GitLab runners do not ship `gh`, so the report goes to job artifacts — visible
in the merge request pipeline page. Exit code `1` fails the job and blocks the
merge when you mark it required.

```yaml
qa-review:
  image: node:22
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  variables:
    TESTEIYA_MODEL: openrouter/anthropic/claude-sonnet-5
    TESTOMATIO_PROJECT_ID: my-project
  script:
    - git fetch origin $CI_MERGE_REQUEST_TARGET_BRANCH_NAME
    - npx testeiya@latest doctor
    - npx testeiya@latest task
        "Review this merge request as a QA engineer. What could go wrong?"
        --output review/report.md --output review/envelope.json
  artifacts:
    when: always
    paths:
      - review/
  parallel:
    # secrets go to Settings > CI/CD > Variables:
    #   OPENROUTER_API_KEY (masked), TESTOMATIO (masked, protected)
```

For posting back to the merge request, hand the envelope's report to GitLab's
API in a follow-up step, or install `gh` plus a token mirror if the project is
also on GitHub.

### Anywhere else

Any scheduler that can run a container works — the contract is just stdin,
stdout, and an exit code:

```bash
echo "Audit the checkout suite for gaps" | testeiya task --output audit.md
case $? in
  0) echo "clean" ;;
  1) echo "findings need review" ;;
esac
```

## Where the report goes

`--output` names a destination and can repeat. Without one the report goes to stdout.

```bash
testeiya task "<task>" --output report.md --output run.json --output gh:pr-comment
```

| Destination | What happens |
|---|---|
| `report.md` | the agent writes the report there |
| `run.json` | the run envelope: verdict, reason, report, tokens, session id |
| `gh:pr-comment` | posted on this branch's pull request |
| `gh:pr#123` | posted on that pull request |

Posting uses the GitHub CLI and resolves the PR number from `GITHUB_EVENT_PATH`,
`GITHUB_REF`, or `gh pr view` — so inside Actions it just works. Every
destination is checked before the run starts, so a missing `gh` costs no tokens.

`--footer "<text>"` adds a line under the report and `--header "<text>"` adds
one above. Both go wherever the report goes: stdout, the file, the posted
comment. A footer is what turns a posted report into a conversation: tell the
reader how to answer, and let the workflow feed their reply back into the same
session.

```bash
testeiya task "Review this pull request" \
  --output gh:pr-comment \
  --footer "> You can reply to this comment by typing /testeiya"
```

Write no footer of your own and the report is signed:

> *🧚🏻‍♀️ Provided by [Testeiya QA Agent](https://testomat.ai/testeiya) & claude-sonnet-5*

Pass `--no-default-footer`, or set `TESTEIYA_NO_DEFAULT_FOOTER`, to drop it.

Every report also opens with `<!-- testeiya <session> -->`. Markdown renders it
as nothing, and it is how the next round tells its own comments apart from
everyone else's: it answers what is new in the thread instead of posting the
same report again.

## Sessions

Runs are saved under `~/.testeiya`, so a follow-up picks up where the last one
stopped. A resumed run reuses its session's model.

```bash
testeiya task "Review the checkout suite" --name checkout-review --output report.md
testeiya task "Now write the missing cases" -c
testeiya sessions
testeiya task "<task>" --resume <id>
```

Pass `--name` to label a session and `--no-session` to save nothing.

On a machine that keeps its home directory, `--session <label>` continues the
session with that label and starts it the first time, so a job that runs again
and again needs no "does it exist yet" branch. Give each thread its own label.

```bash
testeiya task "Review the new commits" --session "pr-42" --output gh:pr-comment
```

### One file for CI

A CI runner keeps nothing, and `~/.testeiya` is a whole directory to move.
`--session-file <path>` puts the session somewhere the job already caches:

```bash
testeiya task "Review the new commits" \
  --session-file .cache/testeiya/pr-42.jsonl --output gh:pr-comment
```

That one file is the entire thread — the conversation and the catch-up state
below. Restore it before the run, save it after, and the next round continues.
It is written on the first round, so a path that is not there yet is not an
error. `TESTEIYA_SESSION_FILE` sets the same thing from the environment.

Two things to get right. Keep the file out of the working tree, or ignore it
there, so the agent does not read its own transcript back as a file. And make
sure the cache is actually rewritten each round: a cache key that never changes
saves the first round and silently restores it forever.

A saved session records more than the conversation: the commit it ran on, the
branch, the origin, and the pull request it posted to. The next round compares
that against the checkout it wakes up in, and when they differ the agent is told
what it has not read — the commit range to diff, and on a pull request the
comments added since. So a second round reacts to new commits instead of
answering about code that has already moved.

```
Since your last round:

- The checkout moved from a881ad1 to 700fbe1 on main. Read `git log --oneline
  a881ad1..HEAD` and `git diff a881ad1...HEAD` before you answer.
- Pull request #42 may have collected comments since 2026-08-28T20:00:40Z. Read
  them with `gh pr view 42 --comments` and answer what is still open.
```

A round that broke records nothing, so the round after it still catches up from
where the work actually stopped. This rides inside the session, so restoring it
is all a round needs — but the checkout has to reach back far enough to see the
commit the last round stopped on. `--no-session` skips all of it.

### Answering a reply

`--followup` carries what the user said back to the agent. The task stays the
standing instruction and the reply is added under it as a new user message, so
one command serves the first round and every answer after it.

```bash
testeiya task "Review this pull request" --followup "what about the login flow?" \
  --session "pr-42" --output gh:pr-comment
```

`TESTEIYA_FOLLOW_UP` is the same thing from the environment, which is how a
comment body reaches a run without going through the shell. An empty value is
ignored, so the job runs unchanged when nobody replied.

## Testomat.io

Set `TESTOMATIO` to a project API key. The agent can then read and write that
project's tests, suites, runs and plans through `check-tests` and the REST API.

```bash
TESTOMATIO=tstmt_xxx testeiya task --project my-project "Which suites have no tests?"
```

Add the project id and the agent also gets the Testomat.io MCP tools. The id
comes from `--project` or from `TESTOMATIO_PROJECT_ID`; the MCP server needs it,
because a token alone does not say which project to talk to. `TESTOMATIO_URL`
points at a self-hosted instance.

## Skills

A skill is a folder with a `SKILL.md`. The agent sees them all and reaches for
the ones a task calls for. Name one with a slash to make it certain:

```bash
testeiya task "Review this pull request as a QA engineer /qa-thinking"
```

That skill is loaded in front of the task before the run starts, so it does not
depend on the model deciding to open it. A name the package does not ship is
left as plain text, which keeps a task safe to build from someone else's words —
a `/word` in a pull request comment stays a word.

The set is vendored from upstream repositories and moves with every release, so
ask your own install rather than a list in a README:

```bash
testeiya skills             # every bundled skill: name and what it is for
testeiya skills playwright  # filter by name, category or description
testeiya skills --json      # [{name, group, description}]
```

Categories today: QA process, test management, test automation, Explorbot,
Playwright, CodeceptJS.

Sources are declared in `skills/skills.yaml` and pinned in
`skills/skills.lock.json`. The vendored folders are deliberately not committed —
they belong to their authors, under their own licences. A clone has the manifest
and nothing else; `node scripts/vendor-skills.js` fills the tree. Every release
runs it, so the published `testeiya` package ships each skill as current on
release day.

`skillsOverride` in `src/session.ts` keeps only what is found under that tree,
so an arbitrary clone cannot hand the model its own skills. To add yours, point
`additionalSkillPaths` at your folder. [EXTENDING.md](EXTENDING.md) covers both hooks.

To propose a new source, add its line to `skills/skills.yaml`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Building your own agent

The CLI is a thin composition over [pi](https://pi.dev): about 1,500 lines wiring
the SDK to the prompt and skills here. A fork can add pi extensions and custom
tools, or swap the one-shot run loop for pi's full interactive TUI.
[EXTENDING.md](EXTENDING.md) walks through both.

## Contributing

Prompt wording is exactly what an outside contributor can improve, and a change
to it changes how the agent behaves for everyone. Read
[CONTRIBUTING.md](CONTRIBUTING.md) first. It covers what belongs here and what
belongs upstream, in the repository that owns a given skill.

## Issues

This repository is also the public issue tracker for both surfaces:

- Testeiya Desktop app, the packaged desktop application
- Testeiya CLI, the command-line agent in `src/`

## Licence

[MIT](LICENSE).
