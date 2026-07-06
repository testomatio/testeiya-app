# Triage a Failed Run

After a run finishes with failures, the agent clusters them by root cause, separates product bugs from flaky tests and environment noise, reproduces the suspicious ones in a browser, and files or links defects.

## Who and when

The engineer on triage duty after a nightly or release run; a lead who wants "20 failures" turned into "2 bugs, 1 flaky test, 1 broken selector" before standup.

## Flow

1. **Open the run.** The user opens a failed run (run widget) and asks "triage this", or just pastes a run link into chat.
2. **Cluster.** The agent pulls the failed testruns (`testruns_list` with `filter_status=failed`), groups them by error message and suite, and renders a summary: failure clusters as a bar chart, plus a table of clusters with counts and representative errors.
3. **Classify.** For each cluster the agent proposes a class — product bug, flaky, broken test, environment — using the error text, how widespread the cluster is, and (where available) whether the same tests failed in previous runs. The `testomatio-mcp` skill documents this workflow.
4. **Reproduce.** For suspected product bugs, the agent replays the test's steps in the shared browser session, captures a screenshot of the failure state, and attaches it to the testrun (`/api/playwright/attach`).
5. **File.** Confirmed bugs become issues: linked to the failing tests via `tests_issues_link`, or filed in Jira through the Atlassian MCP (one-click catalog) and then linked. Flaky tests get tagged (`tests_update`) so analytics and future plans can exclude them.
6. **Summarize.** A final report: clusters, classifications, evidence links, and actions taken — suitable to paste into standup notes.

## Works today

- Failed-testrun listing with status/substatus/message filters via MCP and the UI proxy (`filter[status]`).
- Browser reproduction, screenshot capture, and attachment upload into a run context.
- Issue linking (`*_issues_link/unlink/list`) via MCP; Jira reachable through the Atlassian MCP in the connections catalog.
- Run detail UI with per-test results and status filters.

## Missing

- **Per-test run history**: classifying "flaky" needs this test's last N statuses across runs. No v2 endpoint returns testruns filtered by `test_id` — only by `run_id`. The enterprise `analytics_tests?kind=flaky` covers part of it, behind a subscription.
- **Stack traces and artifacts in testrun data**: the v2 testrun carries `message` only; artifacts (reporter-uploaded traces, screenshots) are not exposed through the v2 API, so the agent triages from one-line messages.
- **A triage board widget**: cluster → classification → action, with per-cluster confirm; today this is chat prose.
- **Substatus writes**: substatus (e.g. `flaky`, `known-bug`) is filterable on read but the MCP `testruns_update` schema does not expose setting it.

Plan: [06 — Failure triage](../plans/06-failure-triage.md)
