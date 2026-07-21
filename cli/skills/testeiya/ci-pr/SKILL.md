---
name: setup-pr-testing
description: Wire a project's CI so pull requests drive coverage-based selective testing with Testomat.io. On PR open, create one mixed run scoped to the diff (manual cases pending for testers, automated part scheduled) using the coverage map from `qa-test-code-coverage`; then launch the automated tests after a preview deploy or on merge via a CI profile (`run --remote`), inline, or by dispatching another repo. Use to integrate a coverage map into CI, set up PR-triggered testing, run only affected tests per PR or on merge, launch e2e through Testomat.io CI profiles, or wire preview-deploy runs. CI-agnostic (GitHub Actions, GitLab, Azure, Jenkins, Bitbucket, CircleCI, …).
license: MIT
metadata:
  author: Testomat.io
  version: 1.0.0
---

# Setup PR Testing

Wire a project's CI so each pull request drives coverage-based selective testing with Testomat.io. One mixed run is created the moment a PR opens — its manual cases pending for testers, its automated part scheduled. The automated part is launched later, after a preview deploy or on merge.

```
PR opened   ──▶ create one mixed run scoped to the PR diff — nothing executes
                  reporter start --kind mixed --filter coverage:… --format id
                  (manual cases pending · automated part scheduled · RUN_ID persisted)

PR updated  ──▶ nothing recreated — the scope refreshes at execution time

preview up  ──▶ only if each commit deploys to a preview:
                  after the deploy-finished signal, launch the automated part against the preview

PR merged   ──▶ launch the prepared run with the final diff
                  TESTOMATIO_RUN=$RUN_ID reporter run --remote <profile> --filter coverage:…
```

## Use cases

- Integrate a coverage map into CI so PRs run only affected tests.
- Create a Testomat.io test run for every pull request.
- Give testers a manual run per PR.
- Run affected e2e on a preview deploy or after merge.
- Launch e2e through a Testomat.io CI profile (`run --remote`).
- Dispatch e2e that lives in another repo, into the prepared run.

## The goal

**A working pipeline committed to the project's own CI system — that CI config is the one and only finished result.** Run locally only to author it; you are never part of CI. Do not create runs or execute `@testomatio/reporter` to "see it work." The single network call allowed while authoring is the read-only project info API (Step 2). Every other command below is something the pipeline executes later.

## The coverage map drives everything

A coverage map maps source files/globs to test identifiers; the reporter filters it by the PR diff so only impacted tests are prepared and run. It comes from `qa-test-code-coverage` (default `coverage.tests.yml`, one file for both manual and automated tests). Missing map → delegate to `qa-test-code-coverage`; never hand-write one. Without a map nothing can be filtered.

## Method, not snippets

The valuable knowledge is the phase model, the reporter command contract (`references/REPORTER_CONTRACT.md`), and the decisions to confirm with the user. Translating a trigger into a specific CI's YAML/Groovy is not — you already know how every CI expresses "on PR open," "after deploy finished," "on merge," "carry a value between pipelines," and "don't fail the pipeline." Write that config for the CI in front of you; never bake per-CI workflow files into this skill.

## Critical constraints

- **The deliverable is committed CI config — never execute the reporter while authoring.** Only the read-only project info API call is allowed.
- **Discovery first** — delegate to `scan-automation-project` before writing anything.
- **No coverage map → no pipeline.** Delegate map creation to `qa-test-code-coverage`; filtering is never skipped.
- Never assume or hardcode the CI system. Read the repo; if unclear, ask.
- PR open creates the run but executes nothing — manual cases pending, automated part scheduled.
- Preview launches gate on a deploy-finished signal, never on the push itself.
- Execution jobs never block a PR and never fail a merge/release pipeline — they observe, they don't gate.
- PR comments come from the reporter's own pipes — never script a PR-comment API call.
- Every run gets a PR-based title (`TESTOMATIO_TITLE`) and a rungroup (`TESTOMATIO_RUNGROUP_TITLE`).
- Only touch CI config files. Never source or test files.

## Workflow

### Step 1 — Discover

- Delegate to `scan-automation-project`: which e2e framework exists (unit/integration don't count), are there manual `.test.md` cases, do automated tests live in this repo or elsewhere.
- Read the CI config files to identify the CI system. Several or none → ask which runs PRs.
- Locate the coverage map (default `coverage.tests.yml`). Missing → delegate to `qa-test-code-coverage`.

### Step 2 — Pull the project info

The read-only info API describes the project — CI profiles, environments, slug. See `references/REPORTER_CONTRACT.md` §7.

- Requires the project key locally (env or `.env`); self-hosted replaces the host.
- Capture: `project_id` (slug, names the CI secret), `ci_profiles` (`profile_name`, `service`, `pass_run_id` — drives Step 3), `environments` (candidates for `TESTOMATIO_ENV`).
- No key or the call fails → ask the user for the slug and profile name instead.

### Step 3 — Choose how automated tests execute

Three modes. If a `ci_profiles` entry matches the e2e suite, `--remote` is the simplest — recommend it. If unsure, present all three.

| Mode | When it fits | Launch shape |
|---|---|---|
| Remote — CI profile | a profile matches the e2e suite (Settings → CI); Testomat.io owns runner/env/secrets | `reporter run --remote <profile>` |
| Inline — this pipeline | mobile/simulators, services this pipeline spins up, or an e2e job that already works here | `reporter run "<runner>" --filter "coverage:…"` |
| Cross-repo dispatch | the e2e suite lives in another repo and no profile covers it | CI-native cross-pipeline trigger, passing `TESTOMATIO_RUN` |

- Match profiles by `profile_name`/`service` against the framework from Step 1.
- Several plausible or none clearly e2e → ask which profile.
- User wants remote but no profile → creating one (Settings → CI) is a prerequisite; wire the step ready to enable.
- No e2e suite anywhere → wire only the manual phase; never fabricate an e2e job.

### Step 4 — Ask the unknowns

Read the CI files first so you don't ask what's already answered:

- Preview environments — is every commit deployed to a preview? If yes: the observable deploy-finished signal, and where the preview URL surfaces.
- Post-merge timing — launch on merge, or wait for a staging/production deploy? A deploy gate needs its own signal.
- Rungroup strategy — week / day / release / milestone.
- Diff base — the PR's target branch is the default for PR jobs; post-merge jobs need a different base (contract §2).

### Step 5 — Wire the phases into CI

Write the jobs in the CI's own syntax. The skill-specific parts are the reporter commands and env vars (`references/REPORTER_CONTRACT.md`); triggers and value-passing are ordinary CI config.

- (a) PR opened → create the run. Env: `TESTOMATIO`, `TESTOMATIO_TITLE` (PR-based), `TESTOMATIO_RUNGROUP_TITLE`. Run `start --kind mixed --filter coverage:… --format id` once on open; persist `$RUN_ID`. `--kind` follows the project (contract §3). A diff affecting zero tests creates no run — that's success, never a block.
- (b) Preview deployed → launch against the preview (only if Step 4 confirmed previews). Triggered by the deploy-finished signal. Remote mode passes the preview URL as a `--remote-param`; inline points the runner's env at it. Manual cases need no launch — testers work them by hand.
- (c) PR merged → launch the prepared run with the final diff. A fresh `--filter` refreshes the scope to the merged diff; post-merge the target branch is no longer a usable base (contract §2). Keep the job non-blocking.

### Step 6 — Provision secrets and the PR-comment pipe

- Store the key as `TESTOMATIO_<project_slug>`; map it to `TESTOMATIO` in every reporter job.
- Enable the PR-comment pipe by provisioning its token: GitHub `GH_PAT` (built-in token works), GitLab `GITLAB_PAT` (`api` scope), Bitbucket `BITBUCKET_ACCESS_TOKEN` (repo variable).
- No reporter pipe for the platform (e.g. Azure DevOps) → no PR comment; results stay in Testomat.io.
- The `--remote` profile is configured in Testomat.io (Settings → CI), not a repo secret.

### Step 7 — Summarize and hand off

Report: the CI targeted and files written; which phases are wired vs skipped (no previews / no e2e / no profile); the execution mode; title and rungroup scheme; how the launch steps find the prepared run; secrets and prerequisites still to provision; assumptions to confirm. Recommend committing the coverage map alongside the CI config.

## Examples

- Previews + a configured profile — info API lists a profile matching the Playwright suite; every commit deploys to a preview. Wire all three phases; enable the comment pipe.
- e2e in another repo, no profile — present all three modes; user picks cross-repo dispatch. The merge job triggers the e2e repo's pipeline, passing `TESTOMATIO_RUN`. Note remote profiles as the simpler future path.
- No coverage map yet — nothing can be filtered; delegate to `qa-test-code-coverage`; wire CI only after the map exists.
- Manual-only project — `scan-automation-project` finds `.test.md` and no e2e framework. Wire only the PR-open run with `--kind manual`; explain preview/merge phases need an e2e suite first.

## Related skills

- `qa-test-code-coverage` — produces the coverage map that drives filtering.
- `scan-automation-project` — discovers the framework and where tests live.
- `testomatio-reporter` — full reporter flag and env-var reference behind the contract.
- `testomatio-mcp` — reading and analyzing runs after they exist.
