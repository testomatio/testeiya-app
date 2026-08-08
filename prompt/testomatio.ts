import dedent from "dedent";
import type { TestomatioProjectInfo } from "./project-info.js";

const MAX_PROMPT_LABELS = 20;
const MAX_PROMPT_TAGS = 30;
const MAX_PROMPT_ENVS = 15;

const tmsViaDirectTools = dedent`
  # Testomat.io-first operating rules (highest priority)

  This agent works on Testomat.io projects. You have TWO sources of truth and they answer different kinds of questions:

  1. **The pulled markdown workspace (\`cwd\`)** — for **tests** and **suites**. Each project's tests and suite structure are already pulled as markdown files into the working directory (one directory per project slug). This is the canonical source for test content, suite hierarchy, test bodies, tags, gherkin scenarios, file layout. Use \`read\`, \`find\`, \`grep\`, \`ls\` — they're instant and don't hit the network.
  2. **MCP tools under \`testomatio-<slug>\`** — for **dynamic Testomat.io data**: runs, testruns, plans, labels, linked issues, ims config, ci config, analytics. These things don't live as files and MUST come from MCP.

  **Prefer the filesystem for test/suite queries.** Only fall back to \`testomatio-*_tests_list\` / \`testomatio-*_suites_list\` if the user's question genuinely needs cross-tree metadata (e.g. priority, labels, status) that isn't in the markdown, or if the workspace looks stale. Reading test files is faster, cheaper, and gives you the actual code/gherkin.

  **Never** ask the user for the **Testomat.io** API token — it's configured. (This does NOT cover secrets the *app under test* needs to run — its own env vars/tokens. If a test run is blocked by one of those, ask for it.)

  **Statuses and counts are live** — runs change them at any time. Fresh query results supersede numbers from earlier in the conversation; when they differ, the data changed — report the new snapshot.

  ## Banned moves

  - Do NOT call an MCP \`*_tests_list\` or \`*_suites_list\` as your first action for a test/suite question — **read the filesystem first** (\`find\`, \`ls\`, \`grep\`, \`read\`). Fall back to MCP only if the metadata you need isn't in the markdown.
  - Do NOT ask the user for the **Testomat.io** API token — it's already configured. (Secrets the app under test needs to run are a different thing — ask for those if a run is blocked.)
  - Do NOT call \`bash\` / \`find\` / \`grep\` to answer questions about **runs, testruns, plans, labels, linked issues, analytics** — those don't exist as files. Use MCP.

  ## Filesystem vs. MCP cheat sheet

  | Question is about… | First action |
  |---|---|
  | Test content (code, steps, gherkin, description, file path, tags) | \`read\` / \`find\` / \`grep\` in \`cwd\` |
  | Suite hierarchy / structure / which files exist | \`ls\` / \`find\` |
  | Individual test metadata (priority, status flag, labels) | try filesystem; if missing, \`testomatio-*_tests_get\` |
  | Runs, testruns, plans, labels, issues, analytics | MCP \`testomatio-*\` tools |
  | Creating/updating tests or suites | edit the markdown file, then \`npx check-tests push\` |
  | Creating/updating runs, linking issues | MCP create/update tools |
  | Launching automated or mixed Run remotely on CI | Use npx @testomatio/reporter run --remote <profile>, raise error if no CI profiles configured
  | Running automated Run | Use local test runner with testomatio reporter attached to report to current project

  ---
`;

const tmsViaProxy = dedent`
  # Testomat.io-first operating rules (highest priority)

  This agent works on a Testomat.io project. You have TWO sources of truth and they answer different kinds of questions:

  1. **The pulled markdown workspace (\`cwd\`)** — for **tests** and **suites**. Test content, suite hierarchy, bodies, tags and gherkin scenarios are files. Use \`read\`, \`find\`, \`grep\`, \`ls\` — they are instant and hit no network.
  2. **The \`mcp\` tool** — for **dynamic Testomat.io data**: runs, testruns, plans, labels, linked issues, ims config, ci config, analytics. These do not live as files and MUST come from there.

  Testomat.io is reached through **one \`mcp\` tool**, not a tool per operation. Call \`mcp({ search: "<what you need>" })\` to find the right operation, then \`mcp({ tool: "<name>", ... })\` to run it. The handful of reads used most often are also registered as their own tools — use those directly when they fit.

  **Prefer the filesystem for test/suite queries.** Reach for a listing only when the question needs cross-tree metadata (priority, labels, status) the markdown does not carry, or when the workspace looks stale.

  **Never** ask the user for the **Testomat.io** API token — it's configured. (This does NOT cover secrets the *app under test* needs to run — its own env vars/tokens. If a test run is blocked by one of those, report it.)

  **Statuses and counts are live** — runs change them at any time. Fresh query results supersede numbers from earlier in the conversation; when they differ, the data changed — report the new snapshot.

  ## Banned moves

  - Do NOT search for an operation as your first action for a test/suite question — **read the filesystem first** (\`find\`, \`ls\`, \`grep\`, \`read\`). Fall back to a listing only if the metadata you need isn't in the markdown.
  - Do NOT ask the user for the **Testomat.io** API token — it's already configured. (Secrets the app under test needs to run are a different thing — report those if a run is blocked.)
  - Do NOT call \`bash\` / \`find\` / \`grep\` to answer questions about **runs, testruns, plans, labels, linked issues, analytics** — those don't exist as files.

  ## Filesystem vs. Testomat.io cheat sheet

  | Question is about… | First action |
  |---|---|
  | Test content (code, steps, gherkin, description, file path, tags) | \`read\` / \`find\` / \`grep\` in \`cwd\` |
  | Suite hierarchy / structure / which files exist | \`ls\` / \`find\` |
  | Individual test metadata (priority, status flag, labels) | try filesystem; if missing, \`mcp({ search: "get test" })\` |
  | Runs, testruns, plans, labels, issues, analytics | \`mcp({ search: … })\`, then \`mcp({ tool: … })\` |
  | Creating/updating tests or suites | edit the markdown file, then \`npx check-tests push\` |
  | Creating/updating runs, linking issues | the matching \`mcp\` create/update operation |
  | Launching automated or mixed Run remotely on CI | Use npx @testomatio/reporter run --remote <profile>, raise error if no CI profiles configured |
  | Running automated Run | Use local test runner with testomatio reporter attached to report to current project |

  ---
`;

const tmsViaCli = dedent`
  # Testomat.io-first operating rules (highest priority)

  This agent works on a Testomat.io project through the **shell only** — there are no Testomat.io tools in this session.

  1. **The pulled markdown workspace (\`cwd\`)** — the canonical source for **tests** and **suites**: content, hierarchy, bodies, tags, gherkin scenarios. Use \`read\`, \`find\`, \`grep\`, \`ls\`.
  2. **\`npx check-tests\`** — moves test cases between the markdown and Testomat.io (\`pull\`, \`push\`). It reads its credentials from the environment.
  3. **The REST API through \`bash\`** — for dynamic data (runs, testruns, plans, labels, linked issues, analytics): \`curl -H "Authorization: $TESTOMATIO" "$TESTOMATIO_URL/api/v2/..."\`.

  **Never** ask the user for the **Testomat.io** API token — it's configured as \`TESTOMATIO\`. (This does NOT cover secrets the *app under test* needs to run — its own env vars/tokens. If a test run is blocked by one of those, report it.)

  **Statuses and counts are live** — runs change them at any time. Fresh query results supersede numbers from earlier in the conversation.

  ## Banned moves

  - Do NOT shell out for test content that is already a file in \`cwd\` — read the file.
  - Do NOT invent REST paths or parameters. Read the workspace first; when a call is genuinely needed, keep to documented \`/api/v2\` endpoints.
  - Do NOT ask the user for the **Testomat.io** API token.

  ## Filesystem vs. shell cheat sheet

  | Question is about… | First action |
  |---|---|
  | Test content (code, steps, gherkin, description, file path, tags) | \`read\` / \`find\` / \`grep\` in \`cwd\` |
  | Suite hierarchy / structure / which files exist | \`ls\` / \`find\` |
  | Runs, testruns, plans, labels, issues, analytics | \`curl\` against \`/api/v2\` |
  | Creating/updating tests or suites | edit the markdown file, then \`npx check-tests push\` |
  | Launching automated or mixed Run remotely on CI | Use npx @testomatio/reporter run --remote <profile>, raise error if no CI profiles configured |
  | Running automated Run | Use local test runner with testomatio reporter attached to report to current project |

  ---
`;

/**
 * How the agent reaches Testomat.io in this session. The rules are the same;
 * the way to act on them is not, so the harness picks the matching wording.
 */
export function testomatioTms(access: TmsAccess): string {
  if (access === "mcp-proxy") return tmsViaProxy;
  if (access === "cli-only") return tmsViaCli;
  return tmsViaDirectTools;
}

export function testomatioConnection(
  tokenSlugs: string[],
  backendUrl?: string,
  connection?: { projectId?: string; title?: string },
  access: TmsAccess = "mcp-direct"
): string {
  let urlSuffix = "";
  if (backendUrl) urlSuffix = ` (\`${backendUrl}\`)`;

  if (tokenSlugs.length === 0) {
    let project = "";
    if (connection?.projectId) project = ` \`${connection.projectId}\``;
    if (connection?.title) project += ` ("${connection.title}")`;
    return dedent`
      ## Testomat.io Connection (pre-configured)

      This workspace is linked to the Testomat.io project${project}.

      The project API key is **already set** as \`TESTOMATIO\` in the environment of every \`bash\` command you run, along with \`TESTOMATIO_URL\`${urlSuffix}. **Never ask the user for a Testomat.io token or API key** — it is already in scope.

      Push or pull manual test cases with \`npx check-tests\` (or other \`npx @testomatio/*\` commands) — they pick the credentials up from the environment. ${envTokenActions(access)}

    `;
  }

  if (tokenSlugs.length > 1) {
    const projects = tokenSlugs.map((s) => `- ${s}`).join("\n");
    return dedent`
      ## Testomat.io Connection (pre-configured)

      This session spans several Testomat.io projects, so no single \`TESTOMATIO\` env var is exported — only \`TESTOMATIO_URL\`${urlSuffix}. Each project's **MCP server** carries its own credentials (tool prefix: \`testomatio-<slug>\`) — use those for structured actions. **Never ask the user for a Testomat.io token or API key.** Do not guess tokens for \`check-tests\`; use the app's Sync (Pull/Push in the Workspace panel) to move test cases.

      Projects pulled into this working directory (one dir per project):
      ${projects}

    `;
  }

  const projects = tokenSlugs.map((s) => `- ${s}`).join("\n");
  return dedent`
    ## Testomat.io Connection (pre-configured)

    The Testomat.io API key is **already set** in the environment as \`TESTOMATIO\`, and the backend URL is set as \`TESTOMATIO_URL\`${urlSuffix}.

    **Do not ask the user for a Testomat.io token** — it is available to every \`bash\` command you run as the \`TESTOMATIO\` env var.

    Projects pulled into this working directory (one dir per project):
    ${projects}

    ${perProjectActions(access)}

    When you need to push changes back, run \`npx check-tests push\` (or similar \`npx @testomatio/*\` commands) directly — credentials are already in scope.

  `;
}

export function testomatioNotConnected(): string {
  return dedent`
    ## Testomat.io Connection (not connected)

    This workspace is not linked to a Testomat.io project and no API key is available in the environment.

    **Never ask the user to paste a Testomat.io API key or token into the chat.** If a task needs Testomat.io access (pulling or pushing test cases, runs, analytics), tell the user to connect the project first — open **Settings → Testomat.io connection** and link this workspace — then continue once connected. Parts of the task that only touch local files can proceed right away.
  `;
}

/**
 * Compact project-settings block for the system prompt, built from the cached
 * `GET /api/v2/{id}/info` payload (`.testeiya/project-info.json`). Only present
 * fields are rendered; labels/tags are capped with a pointer to the full file.
 */
export function projectSettings(info: TestomatioProjectInfo): string {
  let heading = `**${info.title}** (\`${info.project_id}\`)`;
  if (info.subscription) heading += ` — ${info.subscription} plan`;

  const lines: string[] = [];
  const stack: string[] = [];
  if (info.framework) stack.push(`framework: ${info.framework}`);
  if (info.language) stack.push(`language: ${info.language}`);
  if (stack.length > 0) lines.push(`- Test stack — ${stack.join(", ")}`);
  if (info.repository_url) lines.push(`- Repository: ${info.repository_url}`);
  if (info.artifacts_storage_enabled) {
    lines.push("- Artifacts storage is enabled (test runs can attach screenshots/videos/logs)");
  }
  if (info.environments?.length > 0) {
    const shown = info.environments.slice(0, MAX_PROMPT_ENVS);
    lines.push(`- Environments: ${capped(shown, info.environments.length)}`);
  }
  if (info.features?.length > 0) {
    lines.push(`- Enabled features: ${info.features.join(", ")}`);
  }
  if (info.labels?.length > 0) {
    const shown = info.labels
      .slice(0, MAX_PROMPT_LABELS)
      .map((l) => `${l.title} (\`${l.slug}\`)`);
    lines.push(`- Labels defined in this project: ${capped(shown, info.labels.length)}`);
  }
  if (info.tags?.length > 0) {
    const shown = info.tags.slice(0, MAX_PROMPT_TAGS).map((t) => `@${t}`);
    lines.push(`- Tags in use: ${capped(shown, info.tags.length)}`);
  }
  if (info.ci_profiles?.length > 0) {
    const profiles = info.ci_profiles.map((p) => {
      if (p.service) return `"${p.profile_name}" (${p.service})`;
      return `"${p.profile_name}"`;
    });
    lines.push(`- CI profiles configured (runs can be triggered through them): ${profiles.join(", ")}`);
  }

  let body = heading;
  if (lines.length > 0) body += `\n\n${lines.join("\n")}`;

  return dedent`
    ## Project Settings (Testomat.io)

    ${body}

    Use these when creating or editing tests: assign only labels that exist here, reuse the existing tags/environments before inventing new ones, and match the project's framework/language when generating automated tests. The full configuration JSON (every label, tag, and CI profile config) is cached at \`.testeiya/project-info.json\` — read that file when you need the complete lists.
  `;
}

// How to act on a connection whose token comes from the environment.
function envTokenActions(access: TmsAccess): string {
  if (access === "mcp-proxy") {
    return "For structured actions (list/create/update tests, runs, labels, suites, etc.) prefer the `mcp` tool: `mcp({ search })` to find an operation, `mcp({ tool })` to run it.";
  }
  if (access === "cli-only") {
    return "For runs, plans, labels and analytics use `curl` against `/api/v2` — there are no Testomat.io tools in this session.";
  }
  return "If `testomatio-*` MCP tools are available, prefer them for structured actions (list/create/update tests, runs, labels, suites, etc.).";
}

// The same, where the harness runs one MCP server per pulled project.
function perProjectActions(access: TmsAccess): string {
  if (access === "mcp-proxy") {
    return "The **Testomat.io MCP server** is also connected, reached through the `mcp` tool (`mcp({ search })` to find an operation, `mcp({ tool })` to run it). Prefer it for structured actions (list/create/update tests, runs, labels, suites, etc.) — those are typed, safer, and faster than shell calls. Fall back to `bash` + `check-tests` only for things it does not cover (e.g. pulling full markdown files).";
  }
  if (access === "cli-only") {
    return "There are no Testomat.io tools in this session: use `npx check-tests` for test cases and `curl` against `/api/v2` for runs, plans and labels.";
  }
  return "The **Testomat.io MCP server** is also auto-connected, one instance per project (tool prefix: `testomatio-<slug>`). Prefer MCP tools for structured actions (list/create/update tests, runs, labels, suites, etc.) — they are typed, safer, and faster than shell calls. Fall back to `bash` + `check-tests` only for things the MCP does not cover (e.g. pulling full markdown files).";
}

function capped(shown: string[], total: number): string {
  let suffix = "";
  if (total > shown.length) {
    suffix = ` … and ${total - shown.length} more (see \`.testeiya/project-info.json\`)`;
  }
  return shown.join(", ") + suffix;
}

/**
 * `mcp-direct` — every Testomat.io operation is its own tool, prefixed
 * `testomatio-<slug>`. `mcp-proxy` — one `mcp` tool with search and call.
 * `cli-only` — no tools at all: `check-tests` and REST through the shell.
 */
export type TmsAccess = "mcp-direct" | "mcp-proxy" | "cli-only";
