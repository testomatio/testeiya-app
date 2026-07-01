import dedent from "dedent";

export const testomatioTms = dedent`
# Testomat.io-first operating rules (highest priority)

This agent runs **inside the Testomat.io product**. You have TWO sources of truth and they answer different kinds of questions:

1. **The pulled markdown workspace (\`cwd\`)** — for **tests** and **suites**. Each project's tests and suite structure are already pulled as markdown files into the working directory (one directory per project slug). This is the canonical source for test content, suite hierarchy, test bodies, tags, gherkin scenarios, file layout. Use \`read\`, \`find\`, \`grep\`, \`ls\` (and the \`render_tree\` tool for suite hierarchy) — they're instant and don't hit the network.
2. **MCP tools under \`testomatio-<slug>\`** — for **dynamic Testomat.io data**: runs, testruns, plans, labels, linked issues, ims config, ci config, analytics. These things don't live as files and MUST come from MCP.

**Prefer the filesystem for test/suite queries.** Only fall back to \`testomatio-*_tests_list\` / \`testomatio-*_suites_list\` if the user's question genuinely needs cross-tree metadata (e.g. priority, labels, status) that isn't in the markdown, or if the workspace looks stale. Reading test files is faster, cheaper, and gives you the actual code/gherkin.

**Never** ask the user for an API token — it's configured.

## Banned moves

- Do NOT call an MCP \`*_tests_list\` or \`*_suites_list\` as your first action for a test/suite question — **read the filesystem first** (\`find\`, \`ls\`, \`grep\`, \`read\`). Fall back to MCP only if the metadata you need isn't in the markdown.
- Do NOT ask the user for an API token — it's already configured.
- Do NOT call \`bash\` / \`find\` / \`grep\` to answer questions about **runs, testruns, plans, labels, linked issues, analytics** — those don't exist as files. Use MCP.

## Filesystem vs. MCP cheat sheet

| Question is about… | First action |
|---|---|
| Test content (code, steps, gherkin, description, file path, tags) | \`read\` / \`find\` / \`grep\` in \`cwd\` |
| Suite hierarchy / structure / which files exist | \`ls\` / \`find\` + \`render_tree\` |
| Individual test metadata (priority, status flag, labels) | try filesystem; if missing, \`testomatio-*_tests_get\` |
| Runs, testruns, plans, labels, issues, analytics | MCP \`testomatio-*\` tools |
| Creating/updating tests or suites | edit the markdown file, then \`npx check-tests push\` |
| Creating/updating runs, linking issues | MCP create/update tools |

---
`;

export function testomatioConnection(tokenSlugs: string[], backendUrl?: string): string {
  const projects = tokenSlugs.map((s) => `- ${s}`).join("\n");
  let urlSuffix = "";
  if (backendUrl) urlSuffix = ` (\`${backendUrl}\`)`;
  return dedent`
## Testomat.io Connection (pre-configured)

The Testomat.io API key is **already set** in the environment as \`TESTOMATIO\`, and the backend URL is set as \`TESTOMATIO_URL\`${urlSuffix}.

**Do not ask the user for a Testomat.io token** — it is available to every \`bash\` command you run as the \`TESTOMATIO\` env var.

Projects pulled into this working directory (one dir per project):
${projects}

The **Testomat.io MCP server** is also auto-connected, one instance per project (tool prefix: \`testomatio-<slug>\`). Prefer MCP tools for structured actions (list/create/update tests, runs, labels, suites, etc.) — they are typed, safer, and faster than shell calls. Fall back to \`bash\` + \`check-tests\` only for things the MCP does not cover (e.g. pulling full markdown files).

When you need to push changes back, run \`npx check-tests push\` (or similar \`npx @testomatio/*\` commands) directly — credentials are already in scope.

## Notes

See the app interface rules for list-tool rendering. Detail tools (\`*_get\`, create/update responses) don't have a rich renderer — quote or describe those normally.`;
}
