# Release Readiness Report

Before a release, the agent aggregates everything the TMS knows — run results, coverage, open defects, flaky tests, untested requirements — into a go/no-go report with charts and a concrete risk list.

## Who and when

A QA lead or release manager the day before cut-off; a recurring pre-release ritual that today means an hour of tab-hopping across dashboards.

## Flow

1. **Ask.** "Are we ready to release 2.4?" — optionally scoped to a milestone or plan.
2. **Aggregate.** The agent collects:
   - latest run results for the release plan(s) (`runs_list`, run stats),
   - success-rate trend over the stabilization period (`analytics_stats`),
   - flaky tests still in the release scope (`analytics_tests?kind=flaky`),
   - open linked defects (`issues_list` filtered to release tests),
   - requirements without passing tests (traceability data),
   - manual cases in scope not yet executed.
3. **Render.** One report message: verdict up front ("Not ready — 2 blockers"), then charts (pass-rate trend line, failures by suite bar, coverage pie) and a risk table with owners.
4. **Drill.** Each risk row links to the underlying widget (run, test list, requirement) for verification.
5. **Track.** Re-running the flow daily during stabilization shows the trend; the report format stays stable so diffs are meaningful.

## Works today

- All raw entities are reachable via MCP (runs, testruns, issues, milestones read-only, plans); charts render inline; run stats exist per run.

## Missing

- Everything the composed flows are missing: the **analytics data source** ([02](../plans/02-analytics-and-charts.md)), **per-test history** for flaky classification ([06](../plans/06-failure-triage.md)), and the **traceability matrix** ([07](../plans/07-requirements-traceability.md)).
- **Milestone writes**: `milestones_*` are read-only in the MCP; associating a readiness report or verdict with a milestone needs create/update.
- **Report persistence**: a report worth re-running deserves a home (`.testeiya/reports/` or a Testomat.io attachment) rather than scrollback.

Plan: composition of [02](../plans/02-analytics-and-charts.md) + [06](../plans/06-failure-triage.md) + [07](../plans/07-requirements-traceability.md); no separate plan file — build it last, when its inputs exist.
