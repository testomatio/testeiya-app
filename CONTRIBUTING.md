# Contributing to Testeiya

Thanks for helping. This repository holds the material that decides how the agent behaves, so a small wording change here can change every run of the CLI and the desktop app. That is why it is public: prompts are reviewable in a way that server plumbing is not.

## What lives here

The rule is: **shared is what the model reads, private is what runs the model.**

Here, and open to pull requests:

- `prompt/` — the system-prompt fragments
- `skills/skills.yaml` — the manifest of skill repositories to vendor
- `src/` — the Node CLI

Not here, and not accepted as patches: sessions, servers, transports, workspace classification, sync, authentication, telemetry, the desktop and web UI, and the first-party skills written against those tools. Those live in a private harness repository that consumes this one.

## Prompt changes

Every file in `prompt/` is a `dedent` template that ends up in the agent's system prompt. When you change one:

- Keep instructions short and imperative — one rule per line. The agent reads these as orders, not prose.
- Prefer rewording a principle over adding a case. A rule per scenario grows without bound and the model weights it worse than a single clear principle.
- State what to do, not what not to do, unless a specific wrong move needs banning.
- Remember two harnesses share these fragments. `buildSystemPrompt`'s `tms` option covers the difference in how each reaches Testomat.io — use it instead of forking a fragment.
- **Only describe what every harness has.** This CLI cannot open a browser and has nobody to ask, so guidance about driving a browser, asking the user, or a chat app's widgets does not belong here — an agent told about a tool it does not have wastes turns discovering that. A harness contributes its own through `sections`, `toolBullets` and `rules`.
- Say in your pull request what behaviour you saw before the change and what you expect after. Prompt changes are hard to review from the diff alone.

## Skill changes

A skill is a folder containing `SKILL.md`, optionally with supporting files beside it.

**No skill is authored in this repository.** Every folder under `skills/` — `skills/testomatio/`, `skills/codeceptjs/`, `skills/playwright/` — is fetched from its own upstream repository by the release tooling, and they are gitignored here. A patch against one of them cannot land; send it to the repository listed in `skills/skills.yaml` and it will arrive on the next update. Skills written against the desktop and web app's own tools live in the private harness repository, for the same reason its prompt fragments do.

The frontmatter rules below still describe what the loader expects of any skill it reads:

```markdown
---
name: my-skill
description: Use when … — one sentence saying when the agent should reach for this.
---
```

- `name` is a lowercase slug (`^[a-z0-9]+(-[a-z0-9]+)*$`) and must match the folder name. It doubles as the `/mention` token.
- `description` is required and must be under 1024 characters. Write it as a trigger: when should the agent pick this skill? That sentence is all the agent sees when deciding.

Style that works: short sentences, bullets over paragraphs, a list of use cases, no duplicated parameter tables. Write for an agent skimming under load, not a human reading start to finish.

## Adding an external skill source

Add one line to `skills/skills.yaml` — a GitHub repository, optionally pinned:

```yaml
- owner/repo
- owner/repo/tree/<ref>/<subdir>
```

That line is the whole change — send it as the pull request. `node scripts/vendor-skills.js` resolves the commit, downloads it, and records it in `skills/skills.lock.json`; run it to check your source lands where you expect. Every release runs it too, so the published package carries the result. The fetched folder is never committed here.

## Working on the CLI

```bash
npm install
npm run typecheck
npm run build
node dist/src/cli.js --help
```

Requires Node 22.19 or newer. The CLI runs on [pi](https://pi.dev) and must stay Node-only: no Bun APIs (`Bun.file`, `import.meta.dir`), no native dependencies of our own.

`npm run build` does two things: `tsc` compiles `src/` and `prompt/` into `dist/`, and esbuild bundles `pi-mcp-adapter` into `dist/vendor/mcp.js`. The bundle exists because the adapter ships raw TypeScript and Node refuses to strip types from files under `node_modules` — an installed package cannot import it otherwise.

For a quicker loop, `./testeiya` runs the CLI straight from `src/` through tsx, with no compile step:

```bash
./testeiya doctor
```

Only the MCP adapter still comes from the build, so run `npm run build:vendor` once if you need it.

Two things about the agent's session that are easy to get wrong if you touch `src/session.ts`:

- `session.bindExtensions()` is what starts the extension runtime. `createAgentSession` does not do it, so without that call the MCP adapter is constructed but never initialized and every tool call answers "MCP not initialized".
- `skillsOverride` is a filter, not a loader. pi discovers skills from the directory it is pointed at as well as from the bundled tree, and the filter keeps only the bundled ones — a checkout the agent is run against must not be able to inject its own skills.

## Before you open a pull request

```bash
npm run typecheck
npm run build
```

CI runs the same two. Keep the change scoped — a prompt tweak and a CLI refactor in one pull request are two reviews wedged into one.
