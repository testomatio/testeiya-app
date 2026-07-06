# Launch a Test Run with Browser Assist

A tester launches a run from the UI, walks through the tests in a guided executor, and lets the agent drive a real browser to reach each test's starting state — or execute the steps outright and propose a status.

## Who and when

A QA engineer executing a manual or mixed regression cycle; or a lead who wants the agent to pre-execute the obvious steps and only escalate judgment calls.

## Flow

1. **Start.** The user clicks **Runs → Create run** (or a plan's **Launch run** button), or types "run the checkout smoke plan". The `CreateRunDialog` posts to `/api/testomatio/runs` with title, kind (manual/automated/mixed), test source (all or a plan), and environment.
2. **Executor opens.** A manual run opens the guided executor (`ManualRunRenderer`): test list with status filters, progress bar, and per-test passed/failed/skipped buttons.
3. **Browser assist.** For each test, the user asks "get me to the state for this test" (or clicks the test with the browser open). The agent reads the test's steps from the workspace markdown, opens the shared browser session (`playwright-cli open --headed`), and navigates to the precondition state. The `<browser_state>` block keeps the agent aware of the open page.
4. **Execute or verify.** Two modes:
   - *Assisted*: the user performs the checks by hand and clicks a status. The agent stays available for "why is this failing?" questions against the live page.
   - *Agent-executed*: the agent performs the steps itself, compares actual vs expected, and proposes a status through `ask_question` — the human confirms before `set_status` is applied (destructive widget actions require confirmation).
5. **Evidence.** On failure the agent (or the user, via the executor's screenshot button) captures a screenshot; `/api/playwright/attach` uploads it into the run context. Notes go into the testrun message.
6. **Finish.** `finish_run` closes the run; the run detail widget shows the pass/fail donut and per-test table.

## Works today

- Run creation from the UI, including from a plan (`components/widgets/CreateRunDialog.tsx`).
- The guided executor with agent-drivable actions: `list, search, filter_status, select_test, set_status, set_message, save_next, finish_run` (`components/widgets/items/ManualRunRenderer.tsx`).
- Shared browser session between UI buttons and agent bash commands (`cli/src/api/playwright-cli.ts`), screenshot capture and upload to the run.
- Run detail with donut chart, testruns table, and status filters (`RunItemRenderer.tsx`).

## Missing

- An orchestrated "execute this test in the browser" loop: read steps → drive browser → compare expected → propose status. All primitives exist; the prompt/skill that chains them per-test does not.
- Batch result reporting: each result is one `testruns` call; a long run means many round-trips.
- Launching **automated** runs: no public Testomat.io API to trigger a CI pipeline or an automated run execution (see [platform gaps](../plans/platform-gaps.md)).
- Live progress without polling: the UI polls run-stats; no webhook/SSE from Testomat.io.

Plan: [01 — Test run launcher](../plans/01-test-run-launcher.md)
