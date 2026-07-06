# Create a Test Plan from Current Needs

The user states an intent — "regression plan for the checkout release", "smoke set for the new payment provider", "what should we test after this PR?" — and the agent assembles a Testomat.io test plan from the existing test base, filling gaps with new cases where coverage is thin.

## Who and when

A QA lead planning a release cycle; an engineer who needs a targeted verification set; a team turning a requirements document into a concrete plan.

## Flow

1. **State the need.** Free text, optionally with context: a release scope, a PR link, a requirements doc, or "what changed since the last release".
2. **Gather scope.** Depending on input, the agent:
   - queries tests by TQL (`tests_search`: tags, priorities, suites, labels),
   - runs the `pr-diff` skill on a diff to extract touched features and acceptance criteria,
   - reads requirements via MCP and maps them to linked tests.
3. **Propose selection.** The candidate tests render as a test-list card; the agent explains the rationale (risk, recency of failures, coverage of changed areas) and asks for confirmation via `ask_question` — with `multiSelect` when the user should hand-pick.
4. **Detect gaps.** Scope items with no matching test become proposed new cases (`generate-cases` skill); accepted ones are written as `*.test.md` and pushed, so they get `@T` ids and can join the plan.
5. **Create the plan.** The agent calls `plans_create` via MCP with title, description (the rationale), and the selected tests. The plan card renders with its test list.
6. **Launch.** The plan detail widget already has a **Launch run** button pre-wired to the run dialog; the user starts the cycle immediately or schedules it.

## Works today

- Plans CRUD via MCP (`plans_list/get/create/update/delete/search`), plan browsing UI (`PlansListRenderer`, `PlanItemRenderer`) including **Launch run**.
- TQL test search, `pr-diff` and `generate-cases` skills, multi-select confirmation, markdown case creation and push.
- Runs created from a plan via `CreateRunDialog` (test source = plan).

## Missing

- **Verified plan↔tests association via API.** The MCP `plans_create` schema needs checking for how tests attach to a plan (test ids? TQL query? suites?). If the v2 API can't attach tests at creation, that is a platform gap.
- A **plan builder widget**: a two-pane picker (candidates ↔ selected) beats a 50-option checklist for large plans.
- **Plan kinds/strategies** surfaced in the UI (the v2 plan entity has `kind`; the dialog doesn't expose it).
- Saved **selection rationale**: the "why is this test in the plan" explanation lives only in chat; storing it in the plan description is a convention the prompt should enforce.

Plan: [04 — Test plan builder](../plans/04-test-plan-builder.md)
