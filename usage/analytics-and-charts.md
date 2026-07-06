# Analytics and Charts

The user asks a question about test health — "how did the suite do this month?", "which tests are flaky?", "is automation coverage growing?" — and gets an answer with inline charts, backed by real Testomat.io analytics data.

## Who and when

A QA lead or manager preparing a status update; an engineer investigating suite health; anyone who would otherwise export CSVs and build charts by hand.

## Flow

1. **Ask.** The user types a question: "show me the success rate trend for the last 30 days, split by smoke vs regression".
2. **Fetch.** The agent calls the analytics API — `analytics_stats` with `kind: "success-rate-by-date"` and a TQL `q` filter (`tag IN ['@smoke']`), then again for regression. For questions the aggregated endpoints don't cover, it falls back to paginating `runs`/`testruns` lists and computing locally.
3. **Render.** The agent answers in prose with one or two ` ```chart ` fenced blocks — the chat renders them inline as themed recharts (bar/line/area/pie, multi-series). Comparisons across two series use `series: [{key, label}]`.
4. **Drill down.** Follow-up questions ("which suites drag the rate down?") reuse the fetched data or issue narrower queries. Lists of offending tests render as clickable test-list cards (`render_list`).
5. **Keep.** The user copies the answer, or (future) pins the chart set as a project dashboard that refreshes on open.

## Works today

- Inline chart rendering from ` ```chart ` fences: bar, line, area, pie, multi-series, theme-aware colors (`components/ai-elements/chart-block.tsx`, guidance in `cli/src/prompt/app-ui.ts`).
- Mermaid diagrams for non-quantitative structure (flows, dependency graphs).
- Raw material via MCP: `runs_list`, `testruns_list`, `tests_list` with TQL search; the run detail donut for a single run.

## Missing

- **The analytics data source.** `analytics_tests` / `analytics_stats` (`GET /api/v2/{project}/analytics/{tests|stats}/{kind}`) exist only in the separate `@testomatio/mcp-enterprise` package, which the app does not ship. The standard MCP the app configures has no analytics tools, and the UI proxy whitelist (`cli/src/api/testomatio-proxy.ts`) excludes `analytics`.
- A documented list of analytics `kind` values (known examples: `flaky`, `success-rate-by-date`; the rest are undocumented).
- Availability outside the `api_analytics` subscription feature — or a graceful computed fallback for projects without it.
- A dashboard surface: today every chart lives inside one chat message; there is no way to pin a set of charts per project.

Plan: [02 — Analytics and charts](../plans/02-analytics-and-charts.md)
