# PR-Driven Test Impact

Given a pull request or a diff, the agent identifies which existing tests cover the changed code, proposes a targeted verification plan, and flags changed behavior that has no test at all.

## Who and when

A developer or QA gatekeeper deciding what to run before merging; a team that wants "what should QA look at in this PR?" answered automatically.

## Flow

1. **Provide the change.** The user pastes a PR URL, or the workspace is the repo and the agent reads `git diff main...HEAD` directly.
2. **Analyze.** The `pr-diff` skill extracts touched features, fix intent, acceptance criteria from the description, and linked tickets.
3. **Map to tests.** Coverage mapping connects changed files to tests:
   - `automation-coverage` maps e2e tests to source files (`coverage.e2e.yml`),
   - `manual-coverage` maps manual cases to source (`coverage.manual.yml`),
   - plus TQL search by feature tags for tests not in the coverage maps.
4. **Report.** A short impact report: impacted automated tests (run these), impacted manual cases (execute these), and uncovered changes (risk — no test touches this code). Lists render as test cards; the risk section links to case generation.
5. **Act.** One confirmation creates a targeted plan from the impacted set ([plan builder](create-test-plan.md)) and optionally launches the run; uncovered changes feed the `generate-cases` flow.

## Works today

- `pr-diff`, `automation-coverage`, and `manual-coverage` skills ship with the agent; git and `gh` available through bash.
- TQL search, plan creation via MCP, run launch from a plan.

## Missing

- **Coverage maps must exist first**: the coverage skills generate `coverage.*.yml` on demand, but the flow is only fast if the maps are maintained (regenerated in CI or on sync). No app affordance stores or refreshes them today.
- **PR context in web mode**: reading a PR needs the repo in the workspace or `gh` auth; the managed project workspace (manual tests only) has neither. The flow fits the "open your repo as workspace" mode.
- A **check gate output**: teams will want this as a CI comment ("Testeiya: 4 impacted tests, 1 uncovered change") — needs the CLI variant of this flow plus a formatter.

Plan: covered by [04 — Test plan builder](../plans/04-test-plan-builder.md) (impact analysis is its main input source).
