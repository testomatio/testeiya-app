# Testeiya

AI-powered testing agent for QA teams, built on top of the [oh-my-pi](https://github.com/can1357/oh-my-pi) coding-agent SDK (a fork of [Pi](https://github.com/badlogic/pi-mono) by Mario Zechner).

## About

Testeiya is an interactive terminal agent that helps developers analyze test suites, find coverage gaps, and plan testing strategies. It reads your codebase aggressively while keeping write operations locked down, so you can safely point it at any project.

It ships with [Testomat.io](https://testomat.io) skills for test case management and connects to any OpenAI-compatible API (default: [OpenRouter](https://openrouter.ai)).

## Features

- QA-focused system prompt tuned for test analysis
- Read-permissive / write-restricted permission model
- Safe bash commands (git log, cat, grep...) auto-allowed; destructive commands blocked
- Testomat.io skills: test generation, duplicate detection, test improvement, reporter setup
- Markdown-rendered output in terminal
- Multi-line paste support
- Configurable LLM provider and model (OpenRouter by default; any OpenAI-compatible endpoint)

## Installation

```bash
npm install -g testeiya    # requires Bun (https://bun.sh) on your PATH
testeiya
```

Or run from source. This package lives in the [`cli/`](https://github.com/testomatio/testeiya-app/tree/main/cli) directory of the Testeiya monorepo:

```bash
git clone git@github.com:testomatio/testeiya-app.git
cd testeiya-app/cli
bun install
bun src/cli.ts
```

### Requirements

- [Bun](https://bun.sh) — the CLI runs under Bun (its `testeiya` bin uses a `#!/usr/bin/env bun` shebang and runs the TypeScript directly)
- An API key for whatever you set as `provider.name` in config (default is OpenRouter; see [API keys](#api-keys) below)

## Running in Container (Optional)

Instead of installing locally, you can run Testeiya in Docker. Requires [Docker](https://docker.com) to be installed.

```bash
# Build the container
make build

# Configure environment (copy example and edit)
cp .env.example .env
# Edit .env with your API keys

# Run the container
make run

# Stop the container
make stop

# Clean up containers
make clean
```

The container mounts `./src` to `/app/src`, so you can edit code locally and run it inside the container.

### MCP (Testomat.io Integration)

Testeiya includes MCP server for Testomat.io. To enable:

1. Copy `.env.example` to `.env`
2. Add your Testomat.io credentials:

```bash
# In .env file
OPENROUTER_API_KEY=sk-or-your-key
TESTOMATIO_PROJECT_TOKEN=tstmt_xxx
TESTOMATIO_PROJECT_ID=your-project-id
TESTOMATIO_BASE_URL=https://app.testomat.io # or any anoher one
```

3. Run `make run` - MCP will auto-connect

## Usage

```bash
export OPENROUTER_API_KEY=sk-or-your-key-here
bun src/cli.ts
```

Or build and run with Node:

```bash
npm run build
node dist/cli.js
```

You'll see:

```
  Model: openrouter/anthropic/claude-sonnet-4
  Skills: analyze-tests, find-duplicate-cases, generate-test-cases, ...

  Testeiya - AI Testing Agent

  What can I do for you?
```

Type a request like:

- "Analyze the test suite in this project"
- "Find untested code paths in src/controllers"
- "Generate test cases for the auth module"

Paste multi-line text (API docs, specs, requirements) directly into the prompt.

## Configuration

Edit `testeiya.config.json` in the project root:

```json
{
  "provider": {
    "name": "openrouter",
    "baseUrl": "https://openrouter.ai/api/v1",
    "model": "anthropic/claude-sonnet-4",
    "contextWindow": 200000,
    "maxTokens": 16384
  },
  "permissions": {
    "autoAllowRead": true,
    "blockWrites": true,
    "blockBash": true
  }
}
```

- **provider.model** - Any model available on OpenRouter (e.g. `anthropic/claude-sonnet-4`, `openai/gpt-4o`, `google/gemini-2.5-pro`)
- **permissions.blockWrites** - When `true`, edit/write tools are blocked
- **permissions.blockBash** - When `true`, only read-only bash commands are allowed

Config is also loaded from `~/.testeiya/config.json` as a fallback.

### API keys

Read the API key from `process.env.<PROVIDER_NAME>_API_KEY`, where `<PROVIDER_NAME>` is your `provider.name` (uppercase) from config (e.g. `openrouter` in `testeiya.config.json`).

Example: if `provider.name` is `openrouter`, read the API key from `process.env.OPENROUTER_API_KEY`.

| `provider.name` | Environment variable   |
| --------------- | ---------------------- |
| `openrouter`    | `OPENROUTER_API_KEY`   |
| `openai`        | `OPENAI_API_KEY`       |
| `anthropic`     | `ANTHROPIC_API_KEY`    |
| `groq`          | `GROQ_API_KEY`         |

Or set any environment variable name depending of provider name.

## Skills

Testeiya loads skills from [@testomatio/skills](https://github.com/testomatio/skills) plus a built-in `analyze-tests` skill:

| Skill                | Purpose                                  |
| -------------------- | ---------------------------------------- |
| analyze-tests        | Analyze test coverage, quality, and gaps |
| generate-test-cases  | Create test cases from specs or code     |
| find-duplicate-cases | Locate duplicate tests                   |
| improve-test-cases   | Enhance existing test quality            |
| reporter-setup       | Configure test reporters                 |
| sync-cases           | Synchronize test cases with Testomat.io  |

Update skills to latest:

```bash
npm update @testomatio/skills
```

## Architecture

Built on top of the [oh-my-pi coding-agent SDK](https://github.com/can1357/oh-my-pi) (a fork of [Pi](https://github.com/badlogic/pi-mono)):

- **`@oh-my-pi/pi-coding-agent`** - Agent session, tools (read/write/bash/grep/find), extensions
- **`@oh-my-pi/pi-ai`** - Multi-provider LLM abstraction
- **`@oh-my-pi/pi-tui`** - Markdown rendering

```
src/
  cli.ts              # Entry point
  main.ts             # Bootstrap: config, auth, model, skills, session
  config.ts           # Load testeiya.config.json
  system-prompt.ts    # QA/testing system prompt
  permissions.ts      # Read-allow / write-block permission gate
  repl.ts             # Interactive REPL with markdown + paste support
  skills/
    analyze-tests.ts  # Built-in test analysis skill
```

## Development

```bash
# Run directly (no build needed)
bun src/cli.ts

# Type-check
npx tsc --noEmit

# Build for Node
npm run build
```

## License

ISC
