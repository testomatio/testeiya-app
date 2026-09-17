import dedent from "dedent";

/**
 * How the agent works on the Testomat.io project. The rules are the same in
 * every run; only the way to reach the dynamic data differs, so `tms` picks
 * that one line.
 */
export function testomatio(options: TestomatioOptions): string {
  if (!options.connected) {
    return dedent`
      <testomatio-connection>
      This workspace is not linked to a Testomat.io project and no API key is available in the environment.

      * Never ask the user for a Testomat.io API key or token.
      * If a task needs Testomat.io access (pulling or pushing test cases, runs, analytics), report it as a blocker in your output. Parts of the task that only touch local files can proceed right away.
      </testomatio-connection>
    `;
  }

  let url = "";
  if (options.backendUrl) url = ` (\`${options.backendUrl}\`)`;
  return dedent`
    <testomatio>
    This workspace belongs to a Testomat.io project. Two sources answer different questions:

    * Tests and suites are files in the workspace: content, hierarchy, bodies, tags, gherkin scenarios. Read them with \`read\`, \`find\`, \`grep\`, \`ls\`; they are instant and hit no network. Count or list them only when the workspace actually holds \`*.test.md\` suites. In a source checkout with no such files there is nothing to count.
    * Runs, testruns, plans, labels, linked issues, CI config and analytics are not files. ${dynamicData(options.tms)}
    * Statuses and counts are live: runs change them at any time. Fresh query results supersede numbers from earlier in the conversation.
    * To create or update tests or suites, edit the markdown file, then push it with \`npx check-tests push\`; it reads the credentials from the environment.
    * Never ask the user for the Testomat.io API token; it is configured. Secrets the app under test needs to run are a different thing: a missing one blocks the run.
    * The \`scan-automation-project\` skill has the details: which source answers what, syncing test cases, and launching runs.
    </testomatio>

    <testomatio-connection>
    The project API key is already set as \`TESTOMATIO\` in the environment of every \`bash\` command you run, along with \`TESTOMATIO_URL\`${url}.
    </testomatio-connection>
  `;
}

function dynamicData(tms: TmsAccess): string {
  if (tms === "mcp-proxy") {
    return "Get them through the `mcp` tool: search it for the operation you need, then call that operation. The most common reads are also registered as tools of their own; use those directly when they fit.";
  }
  if (tms === "cli-only") {
    return "There are no Testomat.io tools in this session. Get them from the REST API: `curl` with the `TESTOMATIO` token as the Authorization header against `$TESTOMATIO_URL/api/v2`. Keep to documented endpoints; never invent paths or parameters.";
  }
  return "Get them through the `testomatio-<slug>` MCP tools, one set per project.";
}

/**
 * `mcp-proxy`: one `mcp` tool with search and call. `cli-only`: no tools at
 * all; `check-tests` and REST through the shell. `mcp-direct`: every operation
 * is its own tool, prefixed `testomatio-<slug>`; the desktop app's one-shot mode.
 */
export type TmsAccess = "mcp-direct" | "mcp-proxy" | "cli-only";

export interface TestomatioOptions {
  /** How the agent reaches Testomat.io in this run. */
  tms: TmsAccess;
  /** A Testomat.io token is in the environment. */
  connected?: boolean;
  backendUrl?: string;
}
