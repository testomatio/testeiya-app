---
name: manual-run-assistant
description: Assist a human executing a manual test run in the browser. Create or resume the run, open the manual-run executor, prepare the environment (headed browser, login state, the page under test), hand each test to the user, and turn captured browser signals (console errors, failed requests, traces) into proposed testrun notes. Use to start, execute, pass, or assist a manual run; to prepare a browser for manual testing; or when a <manual-run-event> block reports a verdict or asks for signal analysis.
license: MIT
metadata:
  author: Testomat.io
  version: 1.0.0
---

# Manual Run Assistant

Semi-automated manual testing. The user executes tests and records verdicts in the manual-run executor widget; you prepare the environment, navigate, watch what the browser captured, and propose findings. You are the assistant, not the tester.

## Use cases

- Start or resume a manual run and open the executor for the user.
- Prepare the environment: headed browser, saved login state, the page under test.
- Walk the user through the run test by test, pre-navigating to each test's page.
- Analyze a failed test's captured signals and propose a testrun note.
- Attach evidence and finish the run with a findings summary.

## The flow

1. **Find or create the run.** Existing runs via MCP `runs_list`/`runs_get`. New: `runs_create` with `kind: "manual"` and the chosen `test_ids`/`suite_ids`/`plan_ids` — ask which tests belong in the run if unclear. The MCP create/update tools may be disabled — `enable_tools` them first. Then `render_item` (kind `run`) and drive the rendered card via the `widget_id` its ack names: `ui_widget` `start_manual_run` opens the executor, same turn.
2. **Prepare the browser.** Check `<browser_state>`; no browser → `playwright-cli open --headed` (the shared session — never `attach --cdp`). Resolve the application-under-test URL by the browser rules — never guess; ask with the candidates you found. If login is needed, let the user sign in (bring the window to front), then offer `playwright-cli state-save` so later sessions skip it (`state-load` restores).
3. **Per test.** `ui_widget` `select_test`, read its steps from `get()`, navigate the browser to the page step 1 starts on. Then hand off via `ask_question`: the user drives, or you execute while they verify. When the user drives: bring the browser to front, tell them to press **Start test** in the executor (starts the timer and signal capture), and **end your turn** — their verdict reaches you as a `<manual-run-event>` when you are idle.
4. **On a `<manual-run-event>`** — see below.
5. **Finish.** `ui_widget` `finish_run` when every test has a verdict (confirm first if some are pending). Then `runs_update` with a short `description`: outcome counts, validated findings, notable signals.

## Handling `<manual-run-event>`

The executor emits one when a saved verdict has evidence (failed, or browser errors were captured) or when the user clicks the signals badge mid-test. The block carries the testrun id, verdict, console errors, failed requests, and the trace path.

- Deepen before judging: `playwright-cli console error`, `playwright-cli requests`, `playwright-cli request <n>` for a suspect request's headers/body. The trace file's `.network` sibling holds the full cross-page record.
- Validate: does the error actually relate to the test's steps? A 404 on a tracking pixel does not fail a login test.
- Validated → propose a short factual note via `ui_widget` `suggest_message`: what broke, the failing request (`[METHOD] url => status`), the console error, which step it surfaced on. The user applies or dismisses it.
- Not validated → answer in one or two sentences; do not invent findings and do not suggest a note.
- Worth keeping visually → `ui_widget` `attach_screenshot`.

## Critical rules

- **Verdicts belong to the user.** Never set or save a status for a test you did not execute and verify yourself.
- **Propose, don't write.** Findings go through `suggest_message` — never `set_message` over the user's text, never `save_next` after a suggestion.
- **`runs_create` without `test_ids`/`suite_ids`/`plan_ids` creates an EMPTY run** — zero testruns, nothing to execute. Always scope it, then confirm with `testruns_list` that the tests are there. Created an empty one by mistake? Delete it (`runs_delete`) — never leave orphan runs and create another.
- **Runs are created via MCP, not `@testomatio/reporter`.** The reporter CLI is for automated/CI result reporting; its `--filter` needs tags registered in the project and fails otherwise.
- **End the turn after a handoff.** Events can only start your turn while you are idle; a turn left open blocks them.
- **Don't set run_time.** The executor's timer records it on save.
- Never guess the target URL — the browser-testing rules apply to every navigation here.

## How Testeiya wires it

- The executor's actions are listed in the `<active_widget>` block; `get()` returns the run, its tests, and the live capture counts.
- **Start test** starts a timer and `POST /api/playwright/capture/start`: a Playwright trace plus freshly cleared console/request lists in the shared `testeiya` browser session — your own `playwright-cli` calls read exactly what the user's actions produced.
- Saving a verdict records the timed `run_time` (seconds), auto-attaches a browser screenshot, stops the capture, and emits the `<manual-run-event>` when there is something to analyze.
- The signals badge in the executor shows live error/failed-request counts; clicking it sends you an analysis request with counts only — read the details yourself.

## Related skills

- `playwright-cli` — the browser command set.
- `testomatio-mcp` — run/test queries beyond the widget.
- `test-management/qa-thinking` — what else could be wrong beyond the failing step.
