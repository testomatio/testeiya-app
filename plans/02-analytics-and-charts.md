# Plan 02 — Analytics and Charts

Give the agent a real analytics data source and the UI a place to keep charts: questions about test health get chart-backed answers, and a pinnable per-project dashboard grows out of them.

Usage flow: [../usage/analytics-and-charts.md](../usage/analytics-and-charts.md)

## Current state

- ` ```chart ` fences render inline (bar/line/area/pie, multi-series, theme tokens) — `components/ai-elements/chart-block.tsx`, prompt guidance in `cli/src/prompt/app-ui.ts`. Mermaid too.
- The analytics endpoints (`/api/v2/{project}/analytics/{tests|stats}/{kind}`, TQL `q` filter) are served by Testomat.io but reachable only through `@testomatio/mcp-enterprise`, which the app does not ship. Standard `@testomatio/mcp` 2.1.1 has no analytics tools.
- The UI proxy whitelist has no `analytics` resource.
- Raw fallback exists: `runs_list`/`testruns_list` pagination + local computation — slow and rate-hungry.

## Implementation

### 1. Data source (pick in this order)

1. **Best:** analytics tools land in the standard `@testomatio/mcp` with a clean "feature not enabled" error (platform gap A3 — coordinate with the MCP repo). The app then gets them for free per project.
2. **Meanwhile:** add `analytics` to the proxy whitelist (`ALLOWED_RESOURCES` + a path segment for `{tests|stats}/{kind}` in `cli/src/api/testomatio-proxy.ts`, allowing `q`, `days`, `from`, `to`, `page`, `per_page` filters). This gives both the UI and — via a small `fetch` in a skill — the agent a path that works with the project token the session already holds.
3. **Fallback for non-enterprise projects:** a `compute-analytics` skill that answers the common questions (pass-rate trend, failures by suite, slowest tests) from paginated `runs`/`testruns` lists, capped to a sane window (e.g. last 30 runs) and explicit about the cap.

### 2. Prompt guidance

Extend `cli/src/prompt/app-ui.ts` (or a new `analytics.ts` layer, added when a project is connected): when the user asks a quantitative question, prefer `analytics_*`; degrade to computed; always answer with a chart block plus one-sentence takeaway; never dump raw tables the chart already shows.

### 3. Dashboard widget

- New widget kind `dashboard` in the `WidgetDescriptor` union (`lib/services/widget-service.ts`): a grid of saved chart specs.
- "Pin chart" affordance on rendered chart blocks (hover action, mirroring the copy button on code blocks) → appends the chart's JSON spec + its source query to `.testeiya/dashboard.json` in the workspace.
- On open (a new tile or icon in `ProjectSection`), the dashboard re-runs each saved query through the proxy and re-renders — charts stay live, not snapshots.
- Refresh-per-tile; failures render the stale chart with a warning badge.

### 4. Documentation dependency

The `kind` catalog is undocumented (known: `flaky`, `success-rate-by-date`). Get the full list + response shapes from the Testomat.io team; encode them in the skill/prompt so the agent doesn't guess kinds. Track in platform-gaps A3.

## Platform dependencies

- A3 — kind documentation, standard-MCP exposure, non-enterprise behavior. The proxy route (step 1.2) works today for enterprise projects; the computed fallback covers the rest.

## Risks

- TQL variance across endpoints (memory: v2 lists use `query` with `=` prefix; analytics use `q`) — encode both conventions explicitly in prompt guidance to stop the agent from cargo-culting one onto the other.
- Chart spam — the prompt must keep the "one chart per claim" discipline; the app-ui guidance already bans duplicating rendered data.

## Effort

S for the proxy route; M for skill + prompt; M for the dashboard widget. Platform docs are the long pole.
