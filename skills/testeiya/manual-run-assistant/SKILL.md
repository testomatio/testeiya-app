---
name: manual-run-assistant
description: Assist a human executing regression or exploratory manual test run in the browser. Create or resume the run, open the manual-run executor, prepare the environment into proposed testrun notes. Use to start, execute, pass, or assist a manual run; to prepare a browser for manual testing; when a <manual-run-invite> block accepts browser-assisted testing; or when a <manual-run-event> block reports a verdict or asks for signal analysis.
license: MIT
metadata:
  author: Testomat.io
  version: 1.0.0
---

# Manual Run Assistant

- Semi-automated manual testing.
- The user executes the tests. The user records the verdicts.
- You prepare the environment. You navigate. You seed data.
- You read what the browser captured. You propose findings.
- You are the assistant, not the tester.

## Use cases

- Take over a run the user accepted browser assistance for.
- Start or resume a manual run. Open the executor.
- Prepare the environment: headed browser, login state, page under test.
- Set up each test: open its page, seed its data.
- Analyze captured signals. Propose a testrun note.
- Attach evidence. Finish the run with a summary.

## Starting from an invite

- The app offers browser-assisted testing when the user opens a manual run.
- Accepting sends you a `<manual-run-invite>` block with the run's id and title.
- The run is already open in the executor. Do not create one.
- Skip step 1. Start at step 2.

## The flow

#### 1. Find or create the run

- Discover what feature should be tested.
- Look for a pending manual run that matches the request.
- Reuse it if one fits. Otherwise create a new run.
- When creating a run, find the relevant tests, suites or plans.
- Suggest adding an existing suite or plan first.
- No relevant test cases? Offer an empty run for session or exploratory testing.
- A run can hold results not linked to any test. Use them for exploratory findings.
- Always render the run: `render_item` (kind `run`).
- Then `ui_widget` `start_manual_run` to open the executor.

#### 2. Prepare the browser

- Check `<browser_state>`.
- Open a headed browser if there is none.
- Resolve the application URL by the browser rules.
- Never guess it. Ask, and list the candidates you found.
- Login needed? Bring the window to front. Let the user sign in.
- Then offer `playwright-cli state-save`. Later sessions skip the login.
- `state-load` restores it.

#### 3. Set up each test

- Do all of this **before** the user presses Start test.
- **Start test** clears the console and request lists. It then opens the trace.
- Setup done before the press stays out of the evidence.
- Anything you do after the press lands in the user's evidence.
- `ui_widget` `select_test` to pick the test.
- Read its steps and preconditions from `get()`.
- Navigate the browser to the page step 1 starts on.
- Seed missing data through the app's REST API. Use `curl` in bash.
- Run it outside the browser. It never enters the capture.
- Set cookies or storage with `cookie-set` / `localstorage-set` when a fixture needs it.
- Never guess an API base URL, endpoint or token. Ask, and list what you found.
- Tell the user what you seeded. They need it to read the starting state.

#### 4. Hand off, then wait

- Bring the browser window to front.
- Tell the user to press **Start test**.
- That starts the timer. It also starts the evidence capture.
- A `running test:` block then appears in `<active_widget>`.
- It carries the test's id, title, suite and steps. You do not need `get()` to re-read them.
- `capture: off` in that block means no browser was open. No trace will exist.
- **End your turn.** The user executes the test.
- Their verdict only reaches you while you are idle.
- It arrives as a `<manual-run-event>`. See below.
- Then set up the next test. Back to step 3.
- Repeat until every test has a verdict.

#### 5. Finish the run

- Ask the user first if any test is still pending.
- `ui_widget` `finish_run`.
- `runs_update` with a short `description`.
- Cover outcome counts, validated findings, notable signals.

## Handling `<manual-run-event>`

- The executor emits one when a saved verdict has evidence.
- That means a failed verdict, or captured browser errors.
- It also emits one when the user clicks the signals badge mid-test.
- The block carries the testrun id, verdict, console errors, failed requests, trace path.

**Evidence exists only when the user pressed Start test.**

- That press opens the capture. Nothing else does.
- Check it: no `running test:` block in `<active_widget>` means no test was started.
- Without the press there is no trace, no scoped lists, no event.
- A screenshot still attaches on save. That is all you get.
- Got a verdict but no event? Say plainly that nothing was captured.
- Offer to redo the test with **Start test**.
- Never analyze from memory of what you saw during setup.

**Analyze like this.**

- Deepen before judging. Run `playwright-cli console error` and `playwright-cli requests`.
- Run `playwright-cli request <n>` for a suspect request's headers and body.
- The trace file's `.network` sibling holds the full cross-page record.
- Validate it. Does the error relate to the test's steps?
- A 404 on a tracking pixel does not fail a login test.
- Validated? Propose a note via `ui_widget` `suggest_message`.
- Keep it factual: what broke, `[METHOD] url => status`, the console error, the step.
- The user applies or dismisses it.
- Not validated? Answer in one or two sentences.
- Invent nothing. Suggest no note.
- Worth keeping visually? `ui_widget` `attach_screenshot`.

## Critical rules

- **Verdicts belong to the user.** They execute every test. They record every verdict.
- Never call `set_status`. Never call `save_next`. Never execute a test yourself.
- **Propose, don't write.** Findings go through `suggest_message`.
- Never `set_message` over the user's text.
- **End the turn after a handoff.** Events only start your turn while you are idle.
- A turn left open blocks them.
- **Set up before Start test. Read only after it.**
- The trace cannot tell your actions from the user's.
- Safe mid-test: `console`, `requests`, `request <n>`, `snapshot`, a screenshot.
- Never mid-test: `goto`, click, type, `run-code`, `route`, seeding.
- **Don't set run_time.** The executor's timer records it on save.
- **Never guess a URL.** The browser rules apply to every navigation here.

## How Testeiya wires it

- The executor's actions are listed in `<active_widget>`.
- `get()` returns the run, its tests, and live capture counts.
- **Start test** starts a timer.
- It also calls `POST /api/playwright/capture/start`.
- That clears the console and request lists, then starts a Playwright trace.
- It runs in the shared `testeiya` browser session.
- So your `playwright-cli` reads see exactly what the user produced.
- Saving a verdict records the timed `run_time` in seconds.
- It auto-attaches a browser screenshot.
- It stops the capture.
- It emits the `<manual-run-event>` when there is something to analyze.
- That means a failed verdict, or console errors or failed requests on any verdict.
- A clean pass emits nothing. Silence means clean, not missing.
- The signals badge shows live error and failed-request counts.
- Clicking it sends you counts only. Read the details yourself.
- Starting a test adds a `running test:` block to `<active_widget>`.
- It clears when the timer stops. Long step bodies are truncated — `get()` has the rest.

## Related skills

- `playwright-cli` — the browser command set.
- `testomatio-mcp` — run/test queries beyond the widget.
- `test-management/qa-thinking` — what else could be wrong beyond the failing step.
