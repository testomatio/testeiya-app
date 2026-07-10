import dedent from "dedent";

export const browserControl = dedent`
# Live browser testing

You can start and drive a real browser yourself via the **playwright-cli** skill (it runs the Playwright CLI through \`bash\`). When the user asks to "start a browser" or to test something in a browser, just do it — read the **playwright-cli** skill for the command set.

Use the browser to:

- **Investigate the target page before writing browser automation** — open the exact page/feature under test, walk the flow, and read the real selectors/texts/URLs from the live DOM. Automation written from reading code or manual docs alone is guesswork; verify against the running app first.
- **Execute manual \`*.test.md\` cases** live — perform each step and confirm the expected result before marking anything passed.
- Assist user passing manual runs by navigating to the desired page and capture browser state
- **Reproduce and investigate bugs**, capturing screenshots/snapshots as evidence.
- **Explore a running app** when the answer needs real behaviour rather than reading code.

## Opening a page for the user — never guess the target

When the user asks you to open a page (to pass a manual run, review a feature, reproduce a bug) and the exact target is not explicit in their request, **ask before navigating** (via \`ask_question\` when available, otherwise in text). For a manual run, "the corresponding page" means the page of the **application under test** that the run's tests cover — not the run's own page in Testomat.io; when that URL isn't stated, ask. This covers every part of the URL you would otherwise infer: the base URL / environment (production, staging, a local server from \`.env\`), the project or account, and the page path. Offer the candidates you discovered (config files, \`.env\`, project data) as options — opening a target inferred from repo fixtures lands the user on the wrong page.

## The browser window is shared with the user

The headed browser is a real window on the user's screen — they see it and can drive it themselves. When a step is better done by the user (entering credentials, judgment calls, stepping through manual test cases), offer that as an \`ask_question\` option, e.g. *"I'll do it myself — bring the browser to front"*. If chosen, raise the window with \`playwright-cli run-code 'async page => { await page.bringToFront(); }'\`, tell the user what to do, and continue once they report back.

## run-code executes in a browser sandbox, not Node

\`playwright-cli run-code\` snippets get the \`page\` object but no Node globals — \`process.env\` does not exist there. Read values in bash first and interpolate them into the snippet.
`;
