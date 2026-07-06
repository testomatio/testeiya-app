# Platform Gaps: Testomat.io API and check-tests

What the flows in [`../usage/`](../usage/) need that the platform does not provide today. Three buckets: gaps in the Testomat.io API, gaps in `check-tests`, and app-side wiring gaps that only look like platform gaps. Each entry names the flows it blocks.

Facts verified against: the v2 proxy and captured traffic (`cli/src/api/testomatio-proxy.ts`, `cli/log/testomatio.http`), `@testomatio/mcp` 2.1.1 tool schemas, `check-tests` 0.20.0 source, and the app's own API handlers.

## Testomat.io API

### A1. v2 run detail has no result counters
`GET /api/v2/{project}/runs/{id}` returns no passed/failed/skipped counts; the app works around it with the app-API endpoint `GET /api/{project}/runs/{id}`, which requires a **user JWT** (`cli/src/api/testomatio-run-stats.ts`). Token-only contexts (CI, `/api/agent/start` sessions, `.env`-token folders) cannot show run stats at all.
**Proposal:** add `passed/failed/skipped/tests_count/status` to the v2 run serializer (or `?include=stats`).
**Blocks:** run launcher (01), triage (06), release readiness.

### A2. No per-test result history
`testruns` can only be filtered by `run_id`. There is no way to ask "statuses of test @T123 across the last 20 runs" — the core query for flaky classification.
**Proposal:** `GET /api/v2/{project}/testruns?test_id=...` or `GET /api/v2/{project}/tests/{id}/history`.
**Blocks:** triage (06), release readiness; partially worked around by enterprise `analytics_tests?kind=flaky`.

### A3. Analytics is enterprise-only and undocumented
`GET /api/v2/{project}/analytics/tests/{kind}` and `/analytics/stats/{kind}` exist but: (a) they are exposed only by the separate `@testomatio/mcp-enterprise` package, which the app does not ship; (b) the set of `kind` values is undocumented (known from README examples: `flaky`, `success-rate-by-date`); (c) they require the `api_analytics` subscription feature.
**Proposal:** document the full `kind` list and response shapes; expose the tools in the standard MCP with graceful "feature not enabled" errors; define which kinds (if any) are available on non-enterprise plans.
**Blocks:** analytics (02), triage (06), release readiness.

### A4. No batch result reporting in v2
`POST /api/v2/{project}/testruns` takes one result per call (`run_id, test_id, status, message, run_time, assigned_to, test_title, automated`). Reporting a 200-test run means 200 calls. The `@testomatio/reporter` pipeline has its own batch API, but it is not documented for third-party use.
**Proposal:** `POST /api/v2/{project}/testruns/bulk` accepting an array, or document the reporter ingestion API.
**Blocks:** run launcher (01) for agent-executed runs.

### A5. No API to trigger automated run execution
Testomat.io can trigger CI pipelines from its own UI, but no public endpoint exposes this. "Launch the automated smoke run" from Testeiya cannot work end-to-end.
**Proposal:** `POST /api/v2/{project}/runs/{id}/trigger` (or a params variant) that fires the project's configured CI trigger and returns the CI build URL.
**Blocks:** run launcher (01) for automated/mixed runs.

### A6. No push channel for run progress
The UI polls run-stats while a run executes. No webhooks or SSE exist for run/testrun updates.
**Proposal:** webhooks per project (run.updated, testrun.created) — polling works but wastes rate limit and feels laggy in the executor.
**Blocks:** run launcher (01) polish; nice-to-have elsewhere.

### A7. Testrun data carries no stack traces or artifacts
v2 testruns expose `message` only. Stack traces, reporter-uploaded artifacts, and attached screenshots are invisible to the API, so triage reasons from one-line messages.
**Proposal:** include `stack` and an `artifacts[]` list (URLs) in the v2 testrun serializer.
**Blocks:** triage (06), self-healing tests idea.

### A8. Substatus is read-only
`filter_substatus` exists on testrun lists, but `testruns_update` (v2 PUT) does not accept a substatus — the agent cannot mark a result `flaky` / `known-bug` after triage.
**Proposal:** accept `substatus` on testrun create/update.
**Blocks:** triage (06).

### A9. No traceability query
Building a requirements×tests coverage matrix requires one `*_issues_list` call per test (N+1). No endpoint returns all requirement→test links for a project in one response.
**Proposal:** `GET /api/v2/{project}/requirements/coverage` (or `issues/links`) returning the link table.
**Blocks:** traceability (07), release readiness.

### A10. Milestones are read-only
The MCP exposes `milestones_list/get` only. Release flows want to attach reports/verdicts to a milestone and create milestones from planning.
**Proposal:** confirm v2 milestone create/update exists and expose it in the MCP.
**Blocks:** release readiness.

### A11. Plan↔tests association is unverified
`plans_create` exists, but how tests attach to a plan (ids at creation? separate endpoint? TQL-based?) is not documented in the MCP schemas we ship. The plan builder (04) needs this confirmed as its first step.
**Blocks:** plan builder (04).

### A12. Inconsistent auth across app-API endpoints
`/api/{project}/attachments` takes the project token; `/api/{project}/transcriptions` and `/api/{project}/runs/{id}` demand the user JWT. The split is undocumented and forces the app to hold both credentials.
**Proposal:** document which app-API endpoints accept which credential; accept project tokens where scope permits (run-stats especially — see A1).
**Blocks:** embedding scenarios; already worked around in code.

## check-tests

### C1. Pull filters are suite-only
`pull` supports `--suite-ids` and nothing else. Pulling "the smoke plan" or "high-priority tests" is impossible.
**Proposal:** `--plan <id>`, `--labels`, `--tags`, `--priority`, or a general `--query <TQL>` on pull.
**Blocks:** plan-scoped workspaces (04), large-project workspaces.

### C2. No machine-readable output
Both commands print human text; the app parses the tail of stdout for error display (`cli/src/api/workspace-sync.ts`). Counts (pulled/pushed/created/detached) are unavailable programmatically.
**Proposal:** `--json` emitting a summary object per run.
**Blocks:** every app surface that reports sync results; import UX (08).

### C3. Push has no dry-run
`pull --dry-run` exists; `push` applies immediately. The app cannot preview "what will change upstream" before pushing user edits.
**Proposal:** `push --dry-run` printing the would-be creates/updates/detaches (with C2, as JSON).
**Blocks:** sync confidence UX; batch apply in design review (03).

### C4. No conflict detection between local and server
`pull --force` (which the app always passes) overwrites local edits; nothing reports "changed both locally and upstream since last sync".
**Proposal:** a `status` (or `diff`) subcommand comparing local files against server state using the same snapshot the app already keeps.
**Blocks:** safe sync for teams editing in both places.

### C5. Import records nothing for undo
Framework import (`check-tests <framework> --create --update-ids`) creates tests but does not record which ids it created; a wrong glob has no clean rollback (`--purge` nukes everything unmatched).
**Proposal:** with C2, include created/updated test ids in the JSON summary so a caller can revert selectively.
**Blocks:** import wizard (08).

### C6. Result reporting is out of scope — confirm the boundary
check-tests imports definitions; `@testomatio/reporter` reports results. That split is fine, but the app ships neither a reporter integration nor a batch v2 path (A4). Decide: agent-executed runs report via v2 testruns (needs A4 for scale) — do not grow check-tests into a reporter.

## App-side wiring gaps (not platform)

Listed so they are not misfiled as API asks; each belongs to a plan:

- **Proxy whitelist** excludes `analytics`, `requirements`, `milestones`, `labels`, `tags` (`ALLOWED_RESOURCES` in `cli/src/api/testomatio-proxy.ts`) → plans 02, 07.
- **`runCheckTests` actions** are hard-coded to `pull | push`; no `import` action or framework passthrough → plan 08.
- **Enterprise MCP not shipped**; analytics tools absent from sessions → plan 02.
- **Explorbot not bundled** while three skills reference it → plan 09.
- **`render_list` kinds** stop at runs/tests/suites/plans/testruns — no requirements/milestones kinds → plans 02, 07.
