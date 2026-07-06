# Plan 07 — Requirements Traceability

Untangle requirements from issues in the app, render a requirements×tests coverage matrix, and close gaps by generating linked cases.

Usage flow: [../usage/requirements-traceability.md](../usage/requirements-traceability.md)

## Current state

- MCP: full `requirements_*` CRUD (with file uploads) and `issues_*` with per-resource link/unlink/list.
- UI: the "Requirements" tile and list are backed by the **`issues`** resource (`ResourceWidgetView` maps requirements → issues); the proxy whitelist has `issues` but not `requirements`.
- Matrix data requires N+1 link calls (gap A9).

## Implementation

### 1. Untangle the entities (app-side)

- Add `requirements` to `ALLOWED_RESOURCES` in `cli/src/api/testomatio-proxy.ts`.
- New `RequirementsListRenderer` backed by the real resource; keep the current issues list as "Linked issues" where it appears.
- Verify against the debug log what the v2 `requirements` payload looks like (title, source, description, files) and shape the renderer to it.

### 2. Coverage matrix

- Agent-side first: a `requirements-coverage` skill builds the matrix — requirements list, then links per requirement (batched as far as the API allows), then coverage status per requirement: `covered` (linked test passing in the latest relevant run), `partial` (linked but failing/never run), `uncovered`.
- Render: summary chart (covered share) + a `render_list` table; a dedicated `matrix` widget only once the shape stabilizes.
- Cache the link table in `.testeiya/traceability.json` with a timestamp so repeat questions in a session don't re-crawl; invalidate on link mutations the agent itself makes.

### 3. Gap closing

For `uncovered` requirements: `generate-cases` with the requirement text (and attached files — `requirements_get` supports uploads) as the spec → approve via `multiSelect` → write + push → `tests_issues_link` back to the requirement. Mark agent-inferred links (content matches from step 2) distinctly and confirm them before persisting.

### 4. External sources

Jira epics / GitHub issues arrive through the existing `issues_*` (already linked in Testomat.io) or live via the Atlassian MCP. The skill treats them as requirement sources: same matrix, `source` column distinguishes origin.

## Platform dependencies

- A9 (bulk link/coverage query) — the N+1 crawl works for tens of requirements, not thousands; escalate when a real project hits the wall. The cache (2) softens it meanwhile.
- Requirements vs issues semantics — confirm with the Testomat.io team which entity the product intends for traceability, so the UI relabeling (1) lands right the first time.

## Risks

- Coverage definitions get contentious ("linked but skipped test = covered?") — define the three states in the skill text and print the definition with every matrix.
- Stale cache after out-of-band edits in Testomat.io — timestamp on the report line, refresh affordance.

## Effort

S for proxy + renderer; M for the skill + cache; widget deferred.
