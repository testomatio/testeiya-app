# Testeiya Project Overview

## What This Project Is

**Testeiya** is a QA-focused AI agent designed for software testing. It combines manual test case management with automated test code capabilities and integrates deeply with [Testomat.io](https://testomat.io) as its test management system.

The project ships in three forms:
- **Desktop app** (proprietary — not in this repo)
- **Web app** (proprietary — not in this repo)
- **CLI agent** (open source — in this repo)

## Repository Structure

This repository contains the **open-source foundation** that powers all three surfaces:

| Component | Location | Purpose |
|-----------|----------|---------|
| **CLI Agent** | `src/` | Command-line tool that runs one QA task and exits (`npx testeiya "<task>"`) |
| **System Prompts** | `prompt/` | The agent's core instructions — role, rules, tool governance, Testomat.io integration, report contract |
| **First-Party Skills** | `skills/testeiya/` | 7 authored skills (manual-run-assistant, manual-run-analysis, answer-formatting, testomatio-docs, check-cucumber, check-tests, testomatio-reporter) |
| **Vendored Skills** | `skills/codeceptjs/`, `skills/testomatio/`, `skills/playwright-*` | External skill repositories from GitHub, not committed (update via `bunosh skills:update`) |
| **Brand Assets** | `brand/` | Testeiya wordmark |
| **Build/Tasks** | `Bunoshfile.js`, `scripts/` | Skill vendor management, docs sync, build automation |

## Skill Architecture

Skills are **specialized instructions** the agent loads when a task matches. Each skill is a folder with a `SKILL.md` containing step-by-step guidance.

### First-Party Skills (in this repo)

Located in `skills/testeiya/`:

1. **manual-run-assistant** — Prepare the browser and hand each manual test over to the human running it
2. **manual-run-analysis** — Validate the signals captured during a manual test into a proposed note
3. **answer-formatting** — Format data/analysis answers (counts, trends, reports)
4. **testomatio-docs** — Search/cite official Testomat.io documentation
5. **check-cucumber** — Sync Gherkin `.feature` files with Testomat.io
6. **check-tests** — Sync markdown test cases with Testomat.io
7. **testomatio-reporter** — Report automated test results to Testomat.io

### Vendored Skills (fetched from upstream)

Defined in `skills/skills.yaml`, fetched via `bunosh skills:update`:

| Vendor | Source | Skills Count | Categories |
|--------|--------|--------------|------------|
| **codeceptjs** | testomatio/skills | 15 | codeceptjs-fundamentals, writing/debugging/refactoring tests, migrations (Cypress, Protractor, TestCafe, Selenium Java), auth, exploration, run analysis, CI fix |
| **testomatio** | testomatio/skills | 25 | test-management (write test cases, detect duplicates, improve cases, requirement review, QA thinking, sprint reports, test-code coverage, TMS sync), test-automation (automate manual cases, debug/fix flaky tests, consolidation, CI setup, change-aware PR testing, data seeding), explorbot (setup, plan, fundamentals) |
| **playwright-best-practices** | currents-dev/playwright-best-practices-skill | 1 | Best practices guide |
| **playwright-cli** | microsoft/playwright-cli | 1 | Browser automation CLI |

**Total: ~47 skills** covering CodeceptJS E2E testing, test management, automation workflows, exploratory testing, and Playwright best practices.

## Technology Stack

```json
{
  "runtime": "Node.js >=22.19.0",
  "language": "TypeScript (ESM)",
  "ai_framework": "@earendil-works/pi-ai, pi-coding-agent, pi-tui",
  "integrations": "@testomatio/mcp, pi-mcp-adapter",
  "build": "tsc + esbuild",
  "package_manager": "npm (with Bunosh task runner)"
}
```

## How It Works

1. **User invokes**: `npx testeiya "<task>" --output report.md`
2. **Agent loads**: System prompts + relevant skills from `skills/` tree
3. **Agent executes**: Using available tools (filesystem, bash, LLM reasoning, Testomat.io MCP)
4. **Agent reports**: Writes final report to `--output` (or stdout)
5. **Exit code**: `0` = success, `1` = failure/negative verdict, `2` = bad usage

## Key Capabilities

### Test Management
- Write, improve, and detect duplicate manual test cases
- Sync test cases with Testomat.io TMS
- Generate test cases from requirements or PRs
- Sprint reporting and QA analytics
- Requirement review and QA thinking

### Test Automation
- Write CodeceptJS/Playwright tests from scratch
- Debug and fix failing/flaky automated tests
- Automate manual test cases
- CI/CD integration and change-aware testing
- Test consolidation and refactoring
- Framework migrations (Cypress → CodeceptJS, Protractor → CodeceptJS, etc.)

### Exploratory Testing
- Explorbot setup and test plan authoring
- Automated exploration workflows

### Integrations
- **Testomat.io**: Full TMS integration via MCP and check-tests/check-cucumber CLIs
- **CI/CD**: GitHub Actions workflows, change-aware PR testing
- **Test Frameworks**: CodeceptJS, Playwright, Cypress, Jest, Mocha, Vitest, WebdriverIO, Cucumber

## Vendor/Dependency Management

External skills are **not committed** to this repo. They're tracked via:
- `skills/skills.yaml` — list of GitHub sources
- `skills/skills.lock.json` — pinned SHAs and folder ownership

To fetch them: `bunosh skills:update`

This keeps the repo lean and respects upstream licenses. The published npm package includes the vendored skills at publish time.

## Contribution Model

✅ **Welcome contributions**: Prompt wording (`prompt/`), first-party skills (`skills/testeiya/`), CLI improvements (`src/`)  
⚠️ **Send upstream**: Changes to vendored skills go to their source repos  
❌ **Closed source**: Desktop and web app harness

See [CONTRIBUTING.md](CONTRIBUTING.md) for frontmatter rules and CI enforcement.

## Issue Tracking

This repo is the **public issue tracker** for:
- Testeiya Desktop app
- Testeiya CLI agent

---

**Summary**: Testeiya is an AI-powered QA agent that bridges manual and automated testing. This repo contains the open-source CLI, system prompts, and skill library — the cognitive foundation that powers the desktop and web apps. It's framework-agnostic, Testomat.io-native, and extensible via a growing skill marketplace.
