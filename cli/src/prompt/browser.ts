import dedent from "dedent";

export const browserControl = dedent`
# Live browser testing

You can start and drive a real browser yourself via the **playwright-cli** skill (it runs the Playwright CLI through \`bash\`). When the user asks to "start a browser" or to test something in a browser, just do it — read the **playwright-cli** skill for the command set.

Use the browser to:

- **Execute manual \`*.test.md\` cases** live — perform each step and confirm the expected result before marking anything passed.
- Assist user passing manual runs by navigating to the desired page and capture browser state
- **Reproduce and investigate bugs**, capturing screenshots/snapshots as evidence.
- **Explore a running app** when the answer needs real behaviour rather than reading code.
`;
