# Testeiya

An agent, app, and the goddess of testing.

Testeiya is a QA-focused AI agent. It reads and writes manual test cases as markdown, works with automated test code, and talks to [Testomat.io](https://testomat.io) as a test management system. It ships as a desktop app, a web app, and the command-line agent in this repository.

This repository holds the parts of Testeiya that shape how the agent thinks:

| Folder | What it is |
|---|---|
| `prompt/` | The system-prompt fragments — the agent's role, rules, tool guidance, Testomat.io operating rules, and the report contract |
| `skills/` | The skills the agent can invoke: `skills/testeiya/` is authored here, every other folder is fetched from its own repository |
| `brand/` | The wordmark both CLIs print |
| `src/` | The `testeiya` command-line agent (Node) |

The desktop and web harness — servers, session management, sync, UI — is not open source.

## Install and use

```bash
npx testeiya "Review the manual tests in this folder and list the gaps" --output report.md
```

The agent runs one task and exits. Progress goes to stderr, the report to `--output` (or stdout when you omit it). Exit codes: `0` pass, `1` failed run or negative verdict, `2` bad usage, `130` interrupted — so it drops into CI as-is.

Requires Node 22.19 or newer and an LLM provider key. The key comes from the environment (`OPENROUTER_API_KEY` and friends), `~/.testeiya/.env`, or `~/.testeiya/auth.json` — the same file the desktop app's Settings dialog writes, so configuring it once covers both.

```bash
testeiya --help                      # every flag
testeiya "<task>" --model openrouter/anthropic/claude-sonnet-4.5
cat task.md | testeiya --output report.md
```

Set `TESTOMATIO` to a project API key and the agent can read and write that project's tests, suites, runs and plans through `check-tests` and the REST API. Add the project id as well and it also gets the Testomat.io tools:

```bash
TESTOMATIO=tstmt_xxx testeiya --project my-project "Which suites have no tests?"
```

The id can come from `--project` or `TESTOMATIO_PROJECT_ID`. The MCP server needs it: a token alone does not tell it which project to talk to.

## Skills

A skill is a folder with a `SKILL.md`. The agent loads them all and invokes the ones a task calls for.

`skills/testeiya/` is authored in this repository. Everything else is vendored from its own upstream repository, listed in `skills/skills.yaml` and pinned in `skills/skills.lock.json`:

```bash
bunosh skills:update          # fetch them all
bunosh skills:update codeceptjs   # or just one vendor
bunosh skills:list            # show the tree
```

Vendored folders are deliberately **not** committed here — they belong to their authors, under their own licences. A fresh clone has only `skills/testeiya/` until you run the update.

## Contributing

Prompt wording and skills are exactly what an outside contributor can improve, and a change to either changes how the agent behaves for everyone. Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it covers what belongs here, what belongs upstream, and the frontmatter rules CI enforces.

## Issues

This repository is also the public issue tracker for both surfaces:

- **Testeiya Desktop app** — the packaged desktop application
- **Testeiya CLI** — the command-line agent in `src/`

## Licence

[MIT](LICENSE).
