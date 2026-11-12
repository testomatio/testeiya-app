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

export interface EnvMcpServer {
  url: string;
  headers: Record<string, string>;
}

/**
 * Extra MCP servers handed to a run from outside — the Testeiya Hub passes the
 * company's connected services (Linear, Jira, …) this way. Inline JSON:
 * `{ "<name>": { "url": "…", "headers": { … } } }`. A bad value warns and runs
 * without the servers, the same soft failure as a broken config file.
 *
 * Parsed once per value, so a warning prints once however often it is read.
 */
export class EnvMcpServers {
  private static parsedFrom: string | null = null;
  private static parsed: Record<string, EnvMcpServer> = {};

  static read(): Record<string, EnvMcpServer> {
    const raw = process.env.TESTEIYA_MCP_SERVERS ?? "";
    if (EnvMcpServers.parsedFrom !== raw) {
      EnvMcpServers.parsedFrom = raw;
      EnvMcpServers.parsed = EnvMcpServers.parse(raw);
    }
    return EnvMcpServers.parsed;
  }

  private static parse(raw: string): Record<string, EnvMcpServer> {
    if (!raw.trim()) return {};
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return EnvMcpServers.ignore("is not valid JSON");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return EnvMcpServers.ignore("must be a JSON object of name to {url, headers}");
    }
    const servers: Record<string, EnvMcpServer> = {};
    for (const [name, entry] of Object.entries(value as Record<string, { url?: unknown; headers?: unknown }>)) {
      if (!entry || typeof entry !== "object" || typeof entry.url !== "string" || !entry.url) {
        process.stderr.write(`  TESTEIYA_MCP_SERVERS: "${name}" has no url, skipping it\n`);
        continue;
      }
      servers[name === SERVER ? `${name}-env` : name] = { url: entry.url, headers: EnvMcpServers.headers(entry.headers) };
    }
    return servers;
  }

  private static headers(value: unknown): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!value || typeof value !== "object") return headers;
    for (const [key, header] of Object.entries(value)) {
      if (typeof header === "string") headers[key] = header;
    }
    return headers;
  }

  private static ignore(why: string): Record<string, EnvMcpServer> {
    process.stderr.write(`  TESTEIYA_MCP_SERVERS ${why}, ignoring it\n`);
    return {};
  }
}

export function envMcpServers(): Record<string, EnvMcpServer> {
  return EnvMcpServers.read();
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

  const servers: LoadedMcpConfig["servers"] = [];
  // The extension also mounts for env servers alone; without a token and a
  // project the Testomat.io server would only start to fail.
  if (hasMcp()) {
    servers.push({
      name: SERVER,
      source: "testeiya",
      scope: "extension",
      config: {
        command: process.execPath,
        args: [mcpServerScript(), "--token", process.env.TESTOMATIO ?? "", "--project", projectId(), "--tools", "full"],
        env,
        exposure: "direct",
      },
    });
  }
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
