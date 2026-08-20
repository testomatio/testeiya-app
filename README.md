# Testeiya

An agent, app, and the goddess of testing.

Testeiya is a QA-focused AI agent. It reads and writes manual test cases as markdown, works with automated test code, and talks to [Testomat.io](https://testomat.io) as a test management system. It ships as a desktop app, a web app, and the command-line agent in this repository.

This repository holds the parts of Testeiya that shape how the agent thinks:

| Folder | What it is |
|---|---|
| `prompt/` | The system-prompt fragments — the agent's role, rules, tool guidance, Testomat.io operating rules, and the report contract |
| `skills/` | The manifest of skills the agent can invoke — every folder is fetched from its own upstream repository |
| `src/` | The `testeiya` command-line agent (Node) |

The desktop and web harness — servers, session management, sync, UI — is not open source.

## Install and use

```bash
npx testeiya task "Review the manual tests in this folder and list the gaps" \
  --model openrouter/anthropic/claude-sonnet-5 --output report.md
```

The agent runs one task and exits — there is no interactive mode. Progress goes to stderr. Exit codes: `0` pass, `1` failed run or negative verdict, `2` bad usage, `130` interrupted — so it drops into CI as-is.

Requires Node 22.19 or newer, a model, and an LLM provider key.

Name a model with `--model <provider>/<id>` or `TESTEIYA_MODEL`. CI usually has neither set, so a run that resolves no model exits `2` instead of picking one for you. `testeiya models` lists what your key can reach.

The key comes from the environment (`OPENROUTER_API_KEY` and friends), `~/.testeiya/.env`, or `~/.testeiya/auth.json` — the same file the desktop app's Settings dialog writes, so configuring it once covers both.

```bash
testeiya --help                              # every flag
testeiya doctor                              # what a run would resolve
testeiya models sonnet                       # models your key can reach
export TESTEIYA_MODEL=openrouter/anthropic/claude-sonnet-5
testeiya task "<task>"
cat task.md | testeiya task --output report.md
```

### Where the report goes

`--output` is a destination and repeats. Without one the report is printed to stdout.

```bash
testeiya task "<task>" --output report.md --output run.json --output gh:pr-comment
```

| Destination | What happens |
|---|---|
| `report.md` | the agent writes the report there |
| `run.json` | the run envelope: verdict, reason, report, tokens, session id |
| `gh:pr-comment` | posted on this branch's pull request |
| `gh:pr#123` | posted on that pull request |

Posting uses the [GitHub CLI](https://cli.github.com), and every destination is checked before the run starts, so a missing `gh` costs no tokens. `--json` prints the envelope to stdout.

### Sessions

Runs are saved, so a follow-up can pick up where the last one stopped. A resumed run reuses its session's model.

```bash
testeiya task "Review the checkout suite" --output report.md
testeiya task "Now write the missing cases" -c    # continue the last one
testeiya sessions                                 # what is saved here
testeiya task "<task>" --resume <id>
testeiya task "<task>" --no-session               # save nothing
```

Set `TESTOMATIO` to a project API key and the agent can read and write that project's tests, suites, runs and plans through `check-tests` and the REST API. Add the project id as well and it also gets the Testomat.io tools:

```bash
TESTOMATIO=tstmt_xxx testeiya task --project my-project "Which suites have no tests?"
```

The id can come from `--project` or `TESTOMATIO_PROJECT_ID`. The MCP server needs it: a token alone does not tell it which project to talk to.

## Skills

A skill is a folder with a `SKILL.md`. The agent loads them all and invokes the ones a task calls for.

Every skill here is vendored from its own upstream repository, declared in `skills/skills.yaml` and pinned to a commit in `skills/skills.lock.json`. The vendored folders are deliberately **not** committed — they belong to their authors, under their own licences. A clone of this repository has the manifest and nothing else; the tree is fetched by the upstream release tooling, which is where the desktop app gets its full set.

The published `testeiya` package therefore ships no skills of its own: `skillsOverride` in `src/session.ts` keeps only what is found under the bundled tree, so a fresh `npx testeiya` run has none until that tree is filled. To add your own, point `additionalSkillPaths` at your folder — [EXTENDING.md](EXTENDING.md) covers both hooks. The first-party skills the desktop app bundles are written against tools only that harness has, so they live with it, in the private repository.

To propose a new source, add its line to `skills/skills.yaml` — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Building your own agent

The CLI is a thin composition over [pi](https://pi.dev): under 850 lines wiring the SDK to the prompt and skills here. A fork can add pi extensions and custom tools, or swap the one-shot run loop for pi's full interactive TUI — [EXTENDING.md](EXTENDING.md) walks through both.

## Contributing

Prompt wording is exactly what an outside contributor can improve, and a change to it changes how the agent behaves for everyone. Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it covers what belongs here and what belongs upstream, in the repository that owns a given skill.

## Issues

This repository is also the public issue tracker for both surfaces:

- **Testeiya Desktop app** — the packaged desktop application
- **Testeiya CLI** — the command-line agent in `src/`

## Licence

[MIT](LICENSE).
