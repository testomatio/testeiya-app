# Exploratory Testing Session

The agent explores a running application in a real browser — following a charter or freely — recording observations, filing candidate bugs with screenshots, and turning stable paths into draft test cases.

## Who and when

A QA engineer time-boxing an exploratory session on a new feature; a team with no tests yet that wants a first map of the app's behavior; a nightly "poke at staging" job.

## Flow

1. **Charter.** The user provides a URL, credentials, and intent: "explore the new billing settings; focus on validation and edge cases". Or picks a stored charter.
2. **Explore.** Two engines:
   - **playwright-cli** (bundled): the agent navigates, snapshots the DOM, tries inputs, follows links — deciding each step from the page state. Video recording captures the session.
   - **Explorbot** (external, via the `explorbot-setup`/`explorbot-plan`/`explorbot-fundamentals` skills): purpose-built autonomous exploration with its own planning loop; the agent installs and drives it.
3. **Observe.** Findings accumulate as structured observations: unexpected errors, validation gaps, dead ends, console errors, slow pages — each with URL, steps to reach, and a screenshot.
4. **Report.** The session ends with a report: coverage map of visited areas (mermaid diagram), findings by severity, and evidence. Bugs the user confirms become issues linked in Testomat.io or Jira tickets.
5. **Harvest.** Stable, valuable paths become draft `*.test.md` cases (`generate-cases` formats them); the user approves via multi-select and they join the manual suite.

## Works today

- The full browser stack: shared session, headed mode, video recording, screenshots, DOM snapshots (`@playwright/cli` + `cli/src/api/playwright-cli.ts` + `BrowserControls`).
- The three Explorbot skills document setup, planning, and driving — but Explorbot itself is not a dependency; the skill installs it on demand.
- Case generation, issue linking, screenshot attachment.

## Missing

- **Session persistence**: observations live in one chat turn; a session log the agent appends to (`.testeiya/sessions/exploratory-<date>.md`) would survive context limits and make reports reproducible.
- **A session widget**: live view of visited pages, findings count, and current screenshot while the agent explores — today the user watches tool calls scroll by.
- **Charter storage**: recurring charters (per feature area) have no home; they fit `.testeiya/` per workspace.
- **Explorbot bundling decision**: install-on-demand each session is slow; either bundle it like `@playwright/cli` or drop the skills to playwright-cli-only exploration.

Plan: [09 — Exploratory testing](../plans/09-exploratory-testing.md)
