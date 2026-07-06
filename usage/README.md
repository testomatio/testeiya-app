# Testeiya Usage Flows

Each document in this directory describes one thing a QA team can do with Testeiya: who does it, the step-by-step flow through the UI and the agent, what already works in the current codebase, and what is missing. Implementation plans live in [`../plans/`](../plans/).

## Flows

| Flow | Status | Plan |
|---|---|---|
| [Launch a test run with browser assist](launch-test-run.md) | 🟡 partial — run creation and the guided executor exist; agent-executed steps need orchestration | [01](../plans/01-test-run-launcher.md) |
| [Analytics and charts](analytics-and-charts.md) | 🔴 blocked on data source — chart rendering just landed; analytics API is enterprise-MCP-only | [02](../plans/02-analytics-and-charts.md) |
| [Review test design for flaws](test-design-review.md) | 🟡 partial — skills exist; report and batch-fix UX missing | [03](../plans/03-test-design-review.md) |
| [Create a test plan from current needs](create-test-plan.md) | 🟡 partial — plans CRUD exists via MCP; no builder UX | [04](../plans/04-test-plan-builder.md) |
| [Automate manual tests](automate-manual-tests.md) | 🟡 partial — generation skills exist; verification loop and ID sync are manual | [05](../plans/05-manual-to-automation.md) |
| [Triage a failed run](failure-triage.md) | 🟡 partial — testruns data reachable; no per-test history or artifacts | [06](../plans/06-failure-triage.md) |
| [Requirements traceability](requirements-traceability.md) | 🔴 needs work — requirements not reachable from the UI; no coverage matrix | [07](../plans/07-requirements-traceability.md) |
| [PR-driven test impact](pr-test-impact.md) | 🟡 partial — pr-diff and coverage skills exist | [04](../plans/04-test-plan-builder.md) |
| [Import automated tests into the TMS](import-automated-tests.md) | 🔴 not wired — check-tests supports 13 frameworks; the app only calls pull/push | [08](../plans/08-import-automated-tests.md) |
| [Exploratory testing session](exploratory-testing.md) | 🟡 partial — browser stack and Explorbot skills exist; Explorbot is not bundled | [09](../plans/09-exploratory-testing.md) |
| [Release readiness report](release-readiness.md) | 🔴 composition — needs analytics, triage, and traceability first | composes 02+06+07 |

Status legend: 🟡 the core pieces exist in the codebase and need wiring or UX; 🔴 a data source, API, or integration is missing.

## Further ideas (no flow written yet)

Ideas that build on infrastructure already in the codebase, roughly ordered by leverage:

- **Voice-driven manual testing** — the transcription endpoint and mic input exist (`/api/testomatio/transcription`); pair them with the guided run executor so a tester walks through cases hands-free, dictating results and notes.
- **Self-healing automated tests** — on a failed automated run, the agent reproduces the failure with `playwright-cli`, fixes the selector or wait, verifies, and opens a PR. Builds on the `automation-debug-tests` skill and the failure-triage flow.
- **Living documentation** — `check-tests -g <file>` already generates a markdown test catalog; publish it as release notes or a wiki page per sprint.
- **Visual regression review** — screenshots are already captured and attached to runs; compare them across runs and flag diffs for human review.
- **Scheduled QA digests** — a weekly agent run that posts the analytics summary (success-rate trend, new flaky tests, coverage delta) to Slack or email. Needs the analytics flow plus a scheduler.
- **Test data and snippets management** — the MCP already exposes `snippets_*` and `steps_*` CRUD; let the agent extract repeated setup steps into shared snippets.
- **Defect sync to Jira** — the Atlassian MCP is already in the one-click catalog; on triage, file the Jira ticket and link it to the failing test via `tests_issues_link`.
- **CI pipelines panel** — `PipelinesSection` is a placeholder today; show CI runs reported to Testomat.io and let the agent trigger/re-run them once a trigger API exists.
- **Project onboarding wizard** — chain `project-scan` → import automated tests → `reporter-setup` → first sync, as a guided first-run experience for a fresh repo.
