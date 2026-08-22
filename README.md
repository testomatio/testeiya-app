# Testeiya

[![npm](https://img.shields.io/npm/v/testeiya)](https://www.npmjs.com/package/testeiya)
[![licence](https://img.shields.io/npm/l/testeiya)](LICENSE)

An agent, app, and the goddess of testing.

Testeiya is a QA-focused AI agent. It reads and writes manual test cases as markdown, works with automated test code, and talks to [Testomat.io](https://testomat.io) as a test management system. It ships as a desktop app, a web app, and the command-line agent in this repository.

This repository holds the parts of Testeiya that shape how the agent thinks:

| Folder | What it is |
|---|---|
| `prompt/` | System-prompt fragments: the agent's role, rules, tool guidance, Testomat.io operating rules, and the report contract |
| `skills/` | The manifest of skills the agent can invoke. Every folder is fetched from its own upstream repository |
| `src/` | The `testeiya` command-line agent (Node) |

The desktop and web harness is not open source. That covers the servers, session management, sync, and UI.

## Install

Requires Node 22.19 or newer, an LLM provider key, and a model.

```bash
npx testeiya task "Review the manual tests in this folder and list the gaps" \
  --model openrouter/anthropic/claude-sonnet-5 --output report.md
```

The key comes from the environment (`OPENROUTER_API_KEY` and friends), from `~/.testeiya/.env`, or from `~/.testeiya/auth.json`. That last file is the one the desktop app's Settings dialog writes, so configuring it once covers both.

Name a model with `--model <provider>/<id>` or with `TESTEIYA_MODEL`. CI usually has neither set, so a run that resolves no model exits `2` rather than picking one for you.

```bash
export TESTEIYA_MODEL=openrouter/anthropic/claude-sonnet-5
testeiya doctor
```

Run `testeiya doctor` first. It reports which key file won, which skills loaded, and whether Testomat.io is reachable, all without spending a token.

## Commands

| Command | What it does |
|---|---|
| `testeiya task "<task>"` | Run one task and write a report |
| `testeiya ask "<question>"` | Answer a question, no report |
| `testeiya doctor` | Check what a run would resolve |
| `testeiya models [pattern]` | List the models your key can reach |
| `testeiya sessions` | List saved sessions for this folder |

The agent runs one task and exits. There is no interactive mode. Progress goes to stderr, so it drops into CI as-is:

| Exit code | Meaning |
|---|---|
| `0` | pass |
| `1` | failed run, or a negative verdict from the agent |
| `2` | bad usage |
| `130` | interrupted |

A task can also come from stdin:

```bash
cat task.md | testeiya task --output report.md
```

Every command takes `--json` for machine-readable output. `testeiya --help` lists the options and the environment variables, and `testeiya help` is the full guide.

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

Posting uses the [GitHub CLI](https://cli.github.com). Every destination is checked before the run starts, so a missing `gh` costs no tokens.

## Sessions

Runs are saved, so a follow-up picks up where the last one stopped. A resumed run reuses its session's model.

```bash
testeiya task "Review the checkout suite" --output report.md
testeiya task "Now write the missing cases" -c
testeiya sessions
testeiya task "<task>" --resume <id>
```

Pass `--name` to label a session and `--no-session` to save nothing.

## Testomat.io

Set `TESTOMATIO` to a project API key. The agent can then read and write that project's tests, suites, runs and plans through `check-tests` and the REST API.

```bash
TESTOMATIO=tstmt_xxx testeiya task --project my-project "Which suites have no tests?"
```

Add the project id and the agent also gets the Testomat.io tools. The id comes from `--project` or from `TESTOMATIO_PROJECT_ID`. The MCP server needs it, because a token alone does not say which project to talk to.

## Skills

A skill is a folder with a `SKILL.md`. The agent loads them all and invokes the ones a task calls for.

Every skill here is vendored from its own upstream repository, declared in `skills/skills.yaml` and pinned to a commit in `skills/skills.lock.json`. The vendored folders are deliberately not committed. They belong to their authors, under their own licences. A clone of this repository has the manifest and nothing else.

`node scripts/vendor-skills.js` fills the tree from the manifest. Every release runs it, so the published `testeiya` package ships the version of each skill that was current on release day. Run it yourself after cloning, or a fresh checkout has none.

`skillsOverride` in `src/session.ts` keeps only what is found under that tree, so an arbitrary clone cannot hand the model its own skills. To add yours, point `additionalSkillPaths` at your folder. [EXTENDING.md](EXTENDING.md) covers both hooks.

The first-party skills the desktop app bundles are written against tools only that harness has, so they live with it, in the private repository.

To propose a new source, add its line to `skills/skills.yaml`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Building your own agent

The CLI is a thin composition over [pi](https://pi.dev): about 1,500 lines wiring the SDK to the prompt and skills here. A fork can add pi extensions and custom tools, or swap the one-shot run loop for pi's full interactive TUI. [EXTENDING.md](EXTENDING.md) walks through both.

## Contributing

Prompt wording is exactly what an outside contributor can improve, and a change to it changes how the agent behaves for everyone. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. It covers what belongs here and what belongs upstream, in the repository that owns a given skill.

## Issues

This repository is also the public issue tracker for both surfaces:

- Testeiya Desktop app, the packaged desktop application
- Testeiya CLI, the command-line agent in `src/`

## Licence

[MIT](LICENSE).
