import { createRequire } from "node:module";
import type { LoadedMcpConfig } from "@earendil-works/pi-coding-agent";
import type { TmsAccess } from "../prompt/testomat.io.js";

const require_ = createRequire(import.meta.url);

export const SERVER = "testomatio";

/**
 * The Testomat.io MCP server needs a project id as well as a token — a token on
 * its own does not identify a project to it. Without one the agent still reaches
 * the project through `check-tests` and REST, which need only the token, so the
 * prompt says exactly that instead of naming tools that are not there.
 */
export function tmsAccess(): TmsAccess {
  if (hasMcp()) return "mcp-tools";
  return "cli-only";
}

export function hasTestomatio(): boolean {
  return Boolean(process.env.TESTOMATIO);
}

export function hasMcp(): boolean {
  return Boolean(process.env.TESTOMATIO && projectId());
}

/**
 * Extra MCP servers handed to a run from outside — the Testeiya Hub passes the
 * company's connected services (Linear, Jira, …) this way. Inline JSON:
 * `{ "<name>": { "url": "…", "headers": { … } } }`. A bad value warns and runs
 * without the servers, the same soft failure as a broken config file.
 */
export function envMcpServers(): Record<string, { url: string; headers: Record<string, string> }> {
  const raw = process.env.TESTEIYA_MCP_SERVERS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, { url?: unknown; headers?: unknown }>;
    const servers: Record<string, { url: string; headers: Record<string, string> }> = {};
    for (const [name, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object" || typeof entry.url !== "string" || !entry.url) continue;
      const headers: Record<string, string> = {};
      if (entry.headers && typeof entry.headers === "object") {
        for (const [key, value] of Object.entries(entry.headers)) {
          if (typeof value === "string") headers[key] = value;
        }
      }
      servers[name === SERVER ? `${name}-env` : name] = { url: entry.url, headers };
    }
    return servers;
  } catch {
    process.stderr.write("  TESTEIYA_MCP_SERVERS is not valid JSON, ignoring it\n");
    return {};
  }
}

function projectId(): string {
  return process.env.TESTOMATIO_PROJECT_ID ?? "";
}

export function mcpServerScript(): string {
  return require_.resolve("@testomatio/mcp/index.js");
}

/**
 * The servers pi's MCP extension connects, built from the environment: the
 * Testomat.io one, plus any handed in through TESTEIYA_MCP_SERVERS. Replaces
 * pi's own config loading, so a CI clone cannot point the agent at an MCP
 * server of its own through `.pi/mcp.json`.
 */
export function mcpConfig(): LoadedMcpConfig {
  const env: Record<string, string> = {};
  if (process.env.TESTOMATIO_URL) env.TESTOMATIO_BASE_URL = process.env.TESTOMATIO_URL;

  const servers: LoadedMcpConfig["servers"] = [
    {
      name: SERVER,
      source: "testeiya",
      scope: "extension",
      config: {
        command: process.execPath,
        args: [mcpServerScript(), "--token", process.env.TESTOMATIO ?? "", "--project", projectId(), "--tools", "full"],
        env,
        exposure: "direct",
      },
    },
  ];
  for (const [name, server] of Object.entries(envMcpServers())) {
    servers.push({
      name,
      source: "testeiya",
      scope: "extension",
      config: { type: "http", url: server.url, headers: server.headers, exposure: "direct" },
    });
  }

  return { servers, errors: [] };
}
