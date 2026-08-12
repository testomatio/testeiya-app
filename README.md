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
npx testeiya "Review the manual tests in this folder and list the gaps" \
  --model openrouter/anthropic/claude-sonnet-5 --output report.md
```

The agent runs one task and exits — there is no interactive mode. Progress goes to stderr, the report to `--output` (or stdout when you omit it). Exit codes: `0` pass, `1` failed run or negative verdict, `2` bad usage, `130` interrupted — so it drops into CI as-is.

Requires Node 22.19 or newer, a model, and an LLM provider key.

There is no default model. Name one with `--model <provider>/<id>` or `TESTEIYA_MODEL`; a run that names none exits `2` rather than spending your money on a model nobody chose.

The key comes from the environment (`OPENROUTER_API_KEY` and friends), `~/.testeiya/.env`, or `~/.testeiya/auth.json` — the same file the desktop app's Settings dialog writes, so configuring it once covers both.

```bash
testeiya --help                      # every flag
export TESTEIYA_MODEL=openrouter/anthropic/claude-sonnet-5
testeiya "<task>"
cat task.md | testeiya --output report.md
```

Set `TESTOMATIO` to a project API key and the agent can read and write that project's tests, suites, runs and plans through `check-tests` and the REST API. Add the project id as well and it also gets the Testomat.io tools:

```bash
TESTOMATIO=tstmt_xxx testeiya --project my-project "Which suites have no tests?"
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
