# Implementation Plans

One plan per feature, each linked to its usage flow in [`../usage/`](../usage/) and to the platform gaps it depends on ([`platform-gaps.md`](platform-gaps.md)).

## Order of work

**Phase 1 — app-only, no platform dependency.** Ships value with the current API.

| Plan | Feature | Why now |
|---|---|---|
| [01](01-test-run-launcher.md) | Test run launcher + browser-assisted execution | The executor, run creation, and browser stack already exist; the missing piece is agent orchestration and a prompt/skill. |
| [03](03-test-design-review.md) | Test design review | Pure skills + workspace work; the chart block and multi-select checklist just landed. |
| [08](08-import-automated-tests.md) | Import automated tests | check-tests already does the work; the app needs one new action and a small UI. Unlocks onboarding. |

**Phase 2 — needs platform coordination.** Start the API conversations now (see platform-gaps A1–A5); build app sides as they land.

| Plan | Feature | Platform dependencies |
|---|---|---|
| [02](02-analytics-and-charts.md) | Analytics and dashboards | A3 (analytics availability/docs); proxy whitelist is app-side |
| [04](04-test-plan-builder.md) | Test plan builder + PR impact | A11 (plan↔tests association) — verify first |
| [06](06-failure-triage.md) | Failure triage | A2 (test history), A7 (stack/artifacts), A8 (substatus) |

**Phase 3 — bigger builds on top.**

| Plan | Feature | Depends on |
|---|---|---|
| [05](05-manual-to-automation.md) | Manual → automation pipeline | 08 (ID sync wiring) |
| [07](07-requirements-traceability.md) | Requirements traceability | A9 (traceability query); proxy whitelist |
| [09](09-exploratory-testing.md) | Exploratory testing sessions | Explorbot bundling decision |

**Last:** the release-readiness report (see [usage flow](../usage/release-readiness.md)) is a composition of 02 + 06 + 07 and needs no plan of its own until those exist.

## Conventions shared by all plans

- New API endpoints go in `cli/src/api/*.ts` as framework-agnostic `(req) => Response` handlers, routed in `app-server.ts` — never as Next.js route handlers.
- Client business logic lives in MobX services (`lib/services/`), consumed by thin `observer` views.
- Agent-facing behavior changes go through the prompt layers (`cli/src/prompt/*.ts`) or a skill in `@testomatio/skills` — prefer a skill when the behavior is a multi-step procedure; skills are tool-agnostic, so gate Testeiya-specific tools (widgets, `ask_question`) on availability.
- Everything that writes MCP or workspace config uses `cli/src/project-dir.ts` constants.
- Widget renderers follow the existing pattern: `next/dynamic` component under `components/widgets/`, dispatched via kind maps in `components/ai-elements/tool.tsx`.
