# Plan 06 — Failure Triage

After a failing run, the agent clusters failures, classifies each cluster (bug / flaky / broken test / environment), reproduces suspects in the browser, and files linked defects — ending with a paste-ready triage summary.

Usage flow: [../usage/failure-triage.md](../usage/failure-triage.md)

## Current state

- Data: `testruns_list` with status/substatus/message filters (MCP + proxy `filter[status]`); run detail widget with per-test table.
- Evidence: browser reproduction + screenshot attach into the run context (`/api/playwright/attach`).
- Defects: `*_issues_link` via MCP; Jira via the Atlassian MCP in the catalog.
- The `testomatio-mcp` skill already sketches run analysis and failure clustering as a procedure.
- Blocked: per-test history (A2), stack traces/artifacts (A7), substatus writes (A8).

## Implementation

### 1. `triage-run` skill

1. Pull failed testruns for the run (paginate fully; report the total).
2. Cluster by normalized error message (strip ids/timestamps/paths) and suite; render a cluster bar chart + table.
3. Classify per cluster with explicit signals: cluster breadth (many tests, one error → environment/infra), message patterns (timeout/selector → broken test or flaky), and history where available.
4. For 'product bug' suspects: reproduce top representative in the browser (reuse the plan-01 step executor against the manual case's steps), attach the failure screenshot.
5. Propose actions per cluster via `ask_question`: file issue + link, tag flaky, fix test (hand off to `automation-debug-tests`), or dismiss.
6. Execute confirmed actions; end with the summary (clusters, classes, evidence links, actions).

### 2. Flaky signal without A2 (interim)

Until a test-history endpoint exists, approximate: fetch the last N runs (`runs_list`), then their failed testruns, and build the per-test failure map locally. Cap N (e.g. 10) and label the result as a window. Move to `analytics_tests?kind=flaky` when available (plan 02's data source work), and to A2 for exact history.

### 3. Triage entry points

- Run detail widget: a **Triage** button that sends the prompt with the run id (widget → chat is a one-liner given `<active_widget>` context).
- Chat: pasted run URL — the agent extracts the id (URL shape: `{baseUrl}/projects/{id}/runs/...`).

### 4. Substatus and tags

Tag flaky tests via `tests_update` (tags are writable on tests). Testrun substatus stays read-only until A8; record the classification in the testrun `message` suffix as the interim convention (`[triage: flaky]`), which the message filter can find later.

## Platform dependencies

- A2 (test history) — exact flaky detection; interim windowed approximation above.
- A7 (stack traces/artifacts) — clusters from one-line messages are coarse; this is the biggest quality lever.
- A8 (substatus writes) — proper classification storage.

## Risks

- Message normalization quality decides cluster quality — keep the normalizer in the skill text as explicit rules (strip UUIDs, numbers, quoted values), iterate on real runs from the debug log.
- Reproduction cost — reproduce only one representative per suspect cluster, confirm before each (browser actions are slow and visible).

## Effort

M for the skill; S for the widget button; interim flaky map is part of the skill. Real depth arrives with A2/A7.
