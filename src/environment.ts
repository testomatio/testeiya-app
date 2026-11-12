/**
 * Every environment variable Testeiya reads, in one list. `testeiya --help`
 * prints it and `testeiya/pipeline` exports it, so a host that starts runs (the
 * Hub, a CI template) sees the same variables the CLI does. A test fails when
 * the source reads a variable that is not here.
 *
 * Variables a CI job sets on its own (`GITHUB_HEAD_REF`, `CI_MERGE_REQUEST_*`,
 * `BITBUCKET_*`, …) are not listed: nobody sets them by hand.
 *
 * No Node imports: this ships to a Worker and a browser with the pipeline entry.
 */
export const ENVIRONMENT_VARIABLES = [
  { name: "TESTEIYA_MODEL", group: "run", flag: "--model", description: "model to run, e.g. openrouter/anthropic/claude-sonnet-5" },
  { name: "TESTEIYA_FOLLOW_UP", group: "run", flag: "--followup", description: "the user's reply; an empty value is ignored" },
  { name: "TESTEIYA_THREAD", group: "run", flag: "--thread", description: "which conversation this is, for posted comments" },
  { name: "TESTEIYA_SESSION_FILE", group: "run", flag: "--session-file", description: "where to keep the session" },
  { name: "TESTEIYA_NO_DEFAULT_FOOTER", group: "run", flag: "--no-default-footer", description: "do not sign the report" },
  { name: "TESTEIYA_MCP_SERVERS", group: "mcp", flag: "--mcp", secret: true, description: 'extra MCP servers as JSON, {"<name>": {"url": "…", "headers": {…}}}' },
  { name: "TESTEIYA_MODELS_JSON", group: "provider", description: "path to a pi models.json, to point providers at a proxy" },
  { name: "OPENROUTER_API_KEY", group: "provider", secret: true, description: "OpenRouter key" },
  { name: "ANTHROPIC_API_KEY", group: "provider", secret: true, description: "Anthropic key" },
  { name: "OPENAI_API_KEY", group: "provider", secret: true, description: "OpenAI key" },
  { name: "GEMINI_API_KEY", group: "provider", secret: true, description: "Google Gemini key" },
  { name: "CLOUDFLARE_API_KEY", group: "provider", secret: true, description: "Cloudflare AI Gateway or Workers AI key" },
  { name: "TESTOMATIO", group: "testomatio", secret: true, description: "Testomat.io project API key" },
  { name: "TESTOMATIO_PROJECT_ID", group: "testomatio", flag: "--project", description: "Testomat.io project id, turns on its MCP tools" },
  { name: "TESTOMATIO_URL", group: "testomatio", description: "Testomat.io base url, for self-hosted" },
  { name: "LANGFUSE_PUBLIC_KEY", group: "tracing", description: "Langfuse public key, turns tracing on with the secret key" },
  { name: "LANGFUSE_SECRET_KEY", group: "tracing", secret: true, description: "Langfuse secret key" },
  { name: "LANGFUSE_BASE_URL", group: "tracing", description: "Langfuse url, for self-hosted; LANGFUSE_BASEURL works too" },
  { name: "BASE_BRANCH", group: "git", description: "what a change is compared to when the CI job does not say; origin/main" },
  { name: "GITHUB_TOKEN", group: "git", secret: true, description: "install-app only: raises GitHub's download rate limit" },
  { name: "TESTEIYA_PIPELINE_SPAWN", group: "pipeline", description: "1 runs each agent stage in its own process" },
] as const satisfies readonly EnvironmentVariable[];

export type EnvironmentVariableName = (typeof ENVIRONMENT_VARIABLES)[number]["name"];

export interface EnvironmentVariable {
  name: string;
  /** What it configures: run, mcp, provider, testomatio, tracing, git, pipeline. */
  group: string;
  description: string;
  /** The CLI option that sets the same thing, when there is one. */
  flag?: string;
  /** Holds a credential: mask it, never print it. */
  secret?: boolean;
}

/** The `Environment:` block of `testeiya --help`. */
export function environmentUsage(): string {
  const width = Math.max(...ENVIRONMENT_VARIABLES.map((variable) => variable.name.length)) + 2;
  return ENVIRONMENT_VARIABLES.map((variable: EnvironmentVariable) => {
    let line = `  ${variable.name.padEnd(width)}${variable.description}`;
    if (variable.flag) line += ` (same as ${variable.flag})`;
    return line;
  }).join("\n");
}
