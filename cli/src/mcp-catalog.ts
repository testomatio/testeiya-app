/**
 * Predefined MCP services Testeiya can install with one click.
 *
 * This is the backend source of truth for the *config* that gets written into a
 * session's `mcp.all.json` / `mcp.json`. Display concerns (logos, blurbs) live
 * on the frontend in `lib/mcp-services.ts`, keyed by the same `id`.
 *
 * All four predefined services are remote OAuth servers — the user clicks
 * "Add" and the pi-coding-agent SDK runs the browser OAuth flow on first
 * connect, so no API keys are collected. A service that *does* need a secret is
 * modeled by adding a `secrets` array: the add flow collects each value and the
 * backend stores it in the entry's `env` / `headers` (never returned to the UI).
 *
 * NOTE: the on-disk transport field the SDK reads is `type` (not `transport`);
 * `api/mcp.ts` translates `transport` → `type` when serializing.
 */

export type McpTransport = "http" | "sse" | "stdio";

export interface CatalogSecret {
  /** Env var the server config references (e.g. via `${NAME}`). */
  env: string;
  /** UI label shown above the input. */
  label: string;
  /** Optional input placeholder. */
  placeholder?: string;
}

export interface CatalogService {
  /** Stable key; also used as the MCP server name written to disk. */
  id: string;
  /** Human-readable name. */
  label: string;
  transport: McpTransport;
  // Remote transport (http / sse):
  url?: string;
  headers?: Record<string, string>;
  // stdio transport:
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** Authentication model. `oauth` → SDK runs a browser flow on first connect. */
  auth?: "oauth" | "apikey" | "none";
  /** Secret inputs to collect before installing (only for apikey/env servers). */
  secrets?: CatalogSecret[];
}

export const MCP_CATALOG: CatalogService[] = [
  {
    id: "linear",
    label: "Linear",
    transport: "http",
    url: "https://mcp.linear.app/mcp",
    auth: "oauth",
  },
  {
    id: "atlassian",
    label: "Jira",
    transport: "sse",
    url: "https://mcp.atlassian.com/v1/sse",
    auth: "oauth",
  },
  {
    id: "figma",
    label: "Figma",
    transport: "http",
    url: "https://mcp.figma.com/mcp",
    auth: "oauth",
  },
  {
    id: "miro",
    label: "Miro",
    transport: "http",
    url: "https://mcp.miro.com/",
    auth: "oauth",
  },
];

export function getCatalogService(id: string): CatalogService | undefined {
  return MCP_CATALOG.find((s) => s.id === id);
}

/** Public descriptors safe to expose to the UI (no secret *values*). */
export function catalogDescriptors() {
  return MCP_CATALOG.map((s) => ({
    id: s.id,
    label: s.label,
    transport: s.transport,
    auth: s.auth ?? "none",
    secrets: s.secrets?.map(({ env, label, placeholder }) => ({
      env,
      label,
      placeholder,
    })),
  }));
}
