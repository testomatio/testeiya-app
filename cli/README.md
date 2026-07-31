<p align="center">
  <a href="https://testomat.ai/testeiya/">
    <img src="https://cdn.jsdelivr.net/npm/testeiya/assets/testeiya-icon.svg" alt="Testeiya logo" width="120">
  </a>
</p>

<h1 align="center">Testeiya CLI</h1>

<p align="center">
  A QA-focused AI agent for your terminal and CI.<br>
  Built on the <a href="https://github.com/can1357/oh-my-pi">oh-my-pi</a> harness (a fork of <a href="https://github.com/badlogic/pi-mono">Pi</a>).
</p>

<p align="center">
  <a href="https://testomat.ai/testeiya/">Website</a> ·
  <a href="https://www.npmjs.com/package/testeiya">npm</a> ·
  <a href="https://testomat.io">Testomat.io</a>
</p>

```text
████████ ███████ ███████ ████████ ███████ ██████ ██    ██  █████
   ██    ██      ██         ██    ██        ██    ██  ██  ██   ██
   ██    █████   ███████    ██    █████     ██     ████   ███████
   ██    ██           ██    ██    ██        ██      ██    ██   ██
   ██    ███████ ███████    ██    ███████ ██████    ██    ██   ██

                 AI Testing Agent · Testomat.io
```

## What is Testeiya CLI?

Testeiya is an AI testing agent: point it at a project and it analyzes test suites, finds coverage gaps, writes and improves test cases, and syncs them with [Testomat.io](https://testomat.io).

**Testeiya CLI** is the terminal edition of that agent. It is made to:

- **run in your terminal** — an interactive agent in the current working directory
- **run in non-interactive environments like CI** — everything is configurable through environment variables and config files, with no GUI required

It reads your codebase freely while keeping writes and destructive commands locked down by default, so you can safely point it at any project.

> Looking for a visual app instead? **Testeiya Desktop** is a separate chat application built on the same agent. Testeiya CLI is the official name of this terminal tool — the two are not the same thing. Learn about both at [testomat.ai/testeiya](https://testomat.ai/testeiya/).

## Quick start

Requires [Bun](https://bun.sh) 1.3+.

```bash
bunx testeiya
```

Or install it globally:

```bash
bun add -g testeiya
testeiya
```

Bring an API key for your LLM provider, or sign in with an AI coding subscription you already have — see [Providers](#providers) below.

Then ask it things like:

- "Analyze the test suite in this project"
- "Find untested code paths in src/controllers"
- "Generate test cases for the auth module"
- "Find duplicate test cases and suggest which to remove"

Multi-line pastes (API docs, specs, requirements) go straight into the prompt.

## Providers

Testeiya is not tied to a single LLM vendor, and it takes two kinds of access: pay-as-you-go API keys, or the AI coding subscription you may already have.

### API platform access

Pick whichever provider your team already uses, export its API key, and go:

| Provider | `provider.name` | API key variable |
| -------------------- | ------------ | -------------------- |
| OpenRouter (default) | `openrouter` | `OPENROUTER_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| Google Gemini | `google` | `GEMINI_API_KEY` |
| Groq | `groq` | `GROQ_API_KEY` |
| Mistral | `mistral` | `MISTRAL_API_KEY` |
| xAI | `xai` | `XAI_API_KEY` |
| Azure OpenAI | `azure-openai-responses` | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL` |
| Ollama (local) | `ollama` | not required |

Many more work out of the box (Together, Cerebras, Moonshot, LM Studio, …), and any OpenAI-compatible endpoint — a vLLM or LiteLLM gateway, a corporate proxy — can be plugged in through `provider.baseUrl`.

Keys can also live in a `.env` file in the working directory or in `~/.testeiya/.env`.

### Subscriptions

Already paying for an AI coding plan? Sign in with it instead of managing API keys — type `/login` inside the agent and pick the account:

| Subscription | `provider.name` |
| ---------------------------- | ---------------- |
| Claude Pro / Max (Anthropic) | `anthropic` |
| ChatGPT / Codex (OpenAI) | `openai-codex` |
| GitHub Copilot | `github-copilot` |
| Gemini (Google account) | `google-gemini-cli` |
| Cursor | `cursor` |
| Kimi Code | `kimi-code` |

…plus GitLab Duo, Qwen, Z.ai and other coding plans — `/login` shows everything available. Credentials are stored locally and refreshed automatically.

To switch providers or models at any time, type `/model` inside the agent, or set `provider.name` and `provider.model` in the config file (see [Configuration](#configuration)).

## Connect to Testomat.io

Testeiya works standalone, but connecting a [Testomat.io](https://testomat.io) project unlocks test management: pulling and pushing test cases, browsing runs, and the Testomat.io MCP tools.

Interactively, type `/connect` inside the agent and pick a project.

In CI or scripts, pass the project token via environment variables:

```bash
export TESTOMATIO=tstmt_your-project-token
```

## Skills

Testeiya ships with a curated skill library, loaded automatically:

- **Test management** (Testomat.io) — write and improve test cases, detect duplicates, analyze coverage, review requirements, sync cases with the TMS
- **Test automation** (Testomat.io) — automate manual test cases, debug flaky tests, set up reporters and PR testing
- **Frameworks** — CodeceptJS (writing, debugging, migrations from Cypress/Protractor/TestCafe/Selenium), Playwright best practices and the Playwright browser CLI
- **Testomat.io docs** — the full product documentation, bundled and searchable, so platform questions are answered from the docs

Add your own: drop a folder with a `SKILL.md` into `~/.testeiya/skills/` (all projects) or `<project>/.testeiya/skills/` (one project). Type `/skills` in the agent to list what's loaded.

## Slash commands

| Command | Purpose |
| ---------- | ------------------------------------------------ |
| `/connect` | Link a Testomat.io project and load its MCP tools |
| `/project` | Switch the active Testomat.io project |
| `/model` | Switch the LLM provider and model |
| `/login` | Sign in with an AI subscription account |
| `/skills` | List loaded skills |
| `/help` | Show all commands |

## Running in CI

Testeiya CLI is built to run where no human is watching. The default permission model (reads allowed, writes and bash blocked) makes it safe to run against a checked-out repository.

Each example below uses a different LLM provider — any provider works on any CI; just export the matching API key variable.

### GitHub Actions

```yaml
- uses: oven-sh/setup-bun@v2
- run: bunx testeiya
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    TESTOMATIO: ${{ secrets.TESTOMATIO_TOKEN }}
```

### GitLab CI

```yaml
testeiya:
  image: oven/bun:1
  script:
    - bunx testeiya
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
    TESTOMATIO: $TESTOMATIO_TOKEN
```

### Bitbucket Pipelines

```yaml
pipelines:
  default:
    - step:
        name: testeiya
        image: oven/bun:1
        script:
          # ANTHROPIC_API_KEY and TESTOMATIO are set as secured repository variables
          - bunx testeiya
```

### Jenkins

```groovy
pipeline {
  agent { docker { image 'oven/bun:1' } }
  environment {
    MISTRAL_API_KEY = credentials('mistral-api-key')
    TESTOMATIO = credentials('testomatio-token')
  }
  stages {
    stage('testeiya') {
      steps {
        sh 'bunx testeiya'
      }
    }
  }
}
```

### Azure Pipelines

```yaml
steps:
  - script: |
      curl -fsSL https://bun.sh/install | bash
      export PATH="$HOME/.bun/bin:$PATH"
      bunx testeiya
    env:
      AZURE_OPENAI_API_KEY: $(AZURE_OPENAI_API_KEY)
      AZURE_OPENAI_BASE_URL: $(AZURE_OPENAI_BASE_URL)
      TESTOMATIO: $(TESTOMATIO_TOKEN)
```

## Configuration

Configuration is layered, lowest to highest priority: built-in defaults, then `testeiya.config.json` in the working directory, then `~/.testeiya/config.json`. The in-app `/model` selection writes to the home file, so it persists across runs.

All options:

| Option | Default | Purpose |
| ------------------------- | ------------ | ------- |
| `provider.name` | `openrouter` | LLM provider id (see [Providers](#providers)) |
| `provider.model` | — | Model id, as your provider names it |
| `provider.baseUrl` | provider's own | API endpoint override, for gateways and self-hosted OpenAI-compatible servers |
| `provider.contextWindow` | `200000` | Context window size the agent budgets against |
| `provider.maxTokens` | `16384` | Maximum output tokens per response |
| `thinkingLevel` | `medium` | Reasoning effort: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `permissions.autoAllowRead` | `true` | Auto-approve read-only tools |
| `permissions.blockWrites` | `true` | Block edit and write tools |
| `permissions.blockBash` | `true` | Allow only read-only bash commands |
| `memoryEnabled` | `true` | Per-project agent memory |
| `testomatioHost` | `https://app.testomat.io` | Testomat.io base URL, for self-hosted instances |
| `toolGate.activeTools` | — | Per-MCP-server glob patterns of tool names to keep active; the rest load on demand |

API keys are never stored in these files — they come from environment variables or `.env` files (working directory or `~/.testeiya/.env`).

## License

ISC
