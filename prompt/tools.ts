import dedent from 'dedent';

/**
 * The tools every harness gives the agent. Anything a particular harness adds —
 * a question tool, a browser it can drive for a watching user — arrives as an
 * extra bullet from that harness, since the agent must not be told about a tool
 * it does not have.
 */
export function tools(options?: { extra?: string[] }): string {
  const extra = (options?.extra ?? []).join('');
  return dedent`
<available-tools>
  You have these tools available:
  * **Read operations (use freely):** \`read\`, \`grep\`, \`ls\`.
    - Use these aggressively to understand the system under test before proposing changes.
  * **Write operations (restricted):** \`write\`, \`edit\`, \`bash\`.
    - Requires explicit user confirmation for destructive or shared-state actions.
${extra}  * **Internal Skills:** For QA-related tasks, check available skills first and prefer using them when applicable.
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
