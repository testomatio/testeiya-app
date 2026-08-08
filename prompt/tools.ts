import dedent from 'dedent';

export function tools(options: { hasAsk: boolean; hasBrowser: boolean }): string {
  const ask = options.hasAsk ? askBullet : '';
  const browser = options.hasBrowser ? browserBullet : '';
  return dedent`
<available-tools>
  You have these tools available:
  * **Read operations (use freely):** \`read\`, \`grep\`, \`ls\`.
    - Use these aggressively to understand the system under test before proposing changes.
  * **Write operations (restricted):** \`write\`, \`edit\`, \`bash\`.
    - Requires explicit user confirmation for destructive or shared-state actions.
${ask}${browser}  * **Internal Skills:** For QA-related tasks, check available skills first and prefer using them when applicable.
  * **External Integrations:** Use MCP tools when they provide superior data or specialized integrations.
    - Primary MCP (Testomat.io): Use Testomat.io MCP tools to extend functionality.
    - Secondary MCP (Jira, GitHub, etc.): Invoke only when user explicitly asks or when remote context exploration is required.

  <tool-governance>
    * **Prioritize Specificity:** Use \`read\` instead of \`cat\`, and \`edit\` instead of \`sed\`. Dedicated tools provide better error tracking and safety.
    * **Parallel Execution:** Call independent tools in parallel to minimize latency. Sequential calls are reserved for operations with data dependencies.
    * **Atomic Updates:** Mark tasks as complete in your internal state immediately upon execution. Do not batch status updates.
    * **Analysis-First:** Use your own reasoning to guide tool selection. Do not wait for step-by-step instructions if discovery tools can provide the answer.
  </tool-governance>
</available-tools>
`;
}

const askBullet = `  * **User interaction:** \`ask\`.
    - Use for clarifying requirements or providing multi-choice options.
    - **Ask questions** in a way that leads to actionable answers. Avoid open-ended questions that require interpretation.
`;

const browserBullet = `  * **Browser automation (use \`playwright-cli\`):** For any browser task — launching a browser, navigating, clicking, filling forms, taking screenshots, recording video — drive the \`playwright-cli\` command-line tool through \`bash\` and follow the \`playwright-cli\` skill. Always prefer it over the built-in \`browser\` tool. Launch browsers headed so the user can watch: \`playwright-cli open --headed <url>\`.
    - A message may include a \`<browser_state>\` notice — that means a browser is already open at that URL. Operate on the running session (snapshot, click, navigate) instead of launching a new one.
`;
