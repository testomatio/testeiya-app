# Plan 04 — Test Plan Builder (with PR Impact Input)

Let the agent assemble a Testomat.io plan from an expressed need — release scope, PR diff, requirement set, or risk criteria — with a proper selection UX and a verified plan↔tests API path.

Usage flows: [../usage/create-test-plan.md](../usage/create-test-plan.md), [../usage/pr-test-impact.md](../usage/pr-test-impact.md)

## Current state

- MCP: `plans_list/get/create/update/delete/search`; UI: `PlansListRenderer`, `PlanItemRenderer` with **Launch run** → `CreateRunDialog` pinned to the plan.
- Input skills: `pr-diff` (diff → features/acceptance criteria), `manual-coverage`/`automation-coverage` (source↔test maps), TQL `tests_search`.
- Unknown: how tests attach to a plan (gap A11).

## Implementation

### 0. Verify the association API (first, one day)

Inspect `plans_create`/`plans_update` payload schemas in `@testomatio/mcp` (`src/mcp/registry/payloads.js`) and probe against a sandbox project with the debug log on (`cli/log/testomatio.http` captures request/response). Determine: test ids at creation? separate link endpoint? TQL-defined plans? Everything below assumes *some* association path; if none exists, escalate A11 and stop.

### 1. `build-test-plan` skill

1. Parse the need: explicit filter ("high-priority checkout tests"), a PR/diff (delegate to `pr-diff`), or a requirements set.
2. Collect candidates: TQL search by tags/priority/suites; coverage-map lookups for diff-driven scope; recent-failure data for risk weighting.
3. Present candidates as a test-list card + rationale per group; hand-pick via `multiSelect` when the set is small, group-level confirm when large.
4. Detect gaps (scope items with no test) → offer `generate-cases`; new cases get pushed first so they have `@T` ids.
5. Create the plan (title, rationale in the description, selected tests); render the plan card.
6. Offer launch (existing button covers manual; automated blocked on A5).

### 2. Plan builder widget (after the skill proves the flow)

Two-pane picker as a `plan-builder` widget kind: left = candidate tests (filterable, grouped by suite), right = selected, with counts and a rationale field. Agent fills the left pane (`ui_widget` action `propose`), user drags/checks, `create` action finalizes. Reuses `TestsListRenderer` internals.

### 3. PR impact entry point

- Workspace-is-repo mode: a chat suggestion chip ("What should we test for this branch?") when the workspace has a git dir and a diff against the default branch.
- The impact report's "run these" section feeds step 1.3 directly.
- CI usage goes through the terminal CLI: `testeiya` in the repo with a prompt file — document it in the skill; no new CLI surface needed yet.

### 4. Coverage-map upkeep

The coverage skills produce `coverage.e2e.yml`/`coverage.manual.yml` on demand. Store them in `.testeiya/` and add a staleness check (git hash of last generation) so impact analysis warns when the map predates the diff.

## Platform dependencies

- A11 — plan↔tests association (step 0 resolves or escalates).
- A5 — automated launch (same as plan 01).
- C1 (`pull --plan`) — would let a plan define a scoped workspace; useful follow-up, not blocking.

## Risks

- Large plans through `multiSelect` (50-option cap) — group-level confirmation for big sets until the widget exists.
- TQL coverage of the selection criteria — verify the variables list (`tql-reference.js`) supports priority/tag/label queries used by the skill.

## Effort

S for verification; M for the skill; M for the widget (second pass).
