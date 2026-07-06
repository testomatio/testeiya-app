# Automate Manual Tests

The agent converts selected manual test cases into automated tests in the project's own framework, verifies them against the running app in a real browser, and wires the results back to Testomat.io.

## Who and when

A team moving a manual regression suite toward automation; an automation engineer who wants the boilerplate written and verified before polishing.

## Flow

1. **Open the code repo.** The user opens their automation project (or app repo) as the workspace. Manual tests overlay it in `.testeiya/manual-tests/` (pulled from Testomat.io), while the sidebar shows the code tree.
2. **Pick candidates.** "Automate the login suite" — or the agent proposes candidates: high-priority manual cases with stable steps and no automated twin (`type: manual` in the markdown, cross-checked against `tests_list` `automated` flags). Confirmation via multi-select checklist.
3. **Scan the project.** The `project-scan` skill detects language, framework (Playwright, Cypress, CodeceptJS, ...), existing test layout, helpers, and selectors conventions.
4. **Generate.** The `automate-test-cases` skill converts each manual case: steps become actions, expected results become assertions, following the repo's existing idioms. New files land next to the existing tests.
5. **Verify in the browser.** The agent runs the new tests (`npx playwright test ...` or the framework equivalent) against the target environment; for failures it debugs live with `playwright-cli` (inspect DOM, fix selectors) and re-runs until green — the `automation-debug-tests` skill covers this loop.
6. **Link IDs.** `check-tests <framework> --update-ids` stamps `@T` ids into the new test titles so Testomat.io links the automated test to the manual case; the case flips to automated on the next sync.
7. **Report results.** The `reporter-setup` skill installs `@testomatio/reporter` so CI runs report into Testomat.io from then on.

## Works today

- All five skills (`project-scan`, `automate-test-cases`, `automation-debug-tests`, `reporter-setup`, `automation-coverage`) ship with the agent.
- The arbitrary-folder workspace model with the manual-tests overlay (`cli/src/workspace-model.ts`).
- The browser stack for live debugging; bash for running the framework's test command.
- `check-tests` supports the frameworks and `--update-ids` — as a CLI.

## Missing

- **App wiring for ID sync**: the app only ever calls `check-tests pull|push` for manual markdown (`cli/src/check-tests.ts` hard-codes `"pull" | "push"`). The framework analysis/import path (`check-tests <framework> --update-ids`) is unreachable through the sync endpoint — the agent must shell out with a raw token, which the prompt discourages.
- **Manual→automated status flip** is implicit (next import flips it); an explicit `tests_update` after linking would make state visible immediately.
- A **progress surface**: automating 20 cases is a long multi-step job; today it is one long chat thread. A checklist widget (per case: generated → ran → green → linked) fits the existing todo-panel pattern.
- **Environment config**: base URL and credentials for the target app come from chat each time; a per-workspace env config the agent reads would remove the repetition.

Plan: [05 — Manual to automation](../plans/05-manual-to-automation.md)
