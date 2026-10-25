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

function projectId(): string {
  return process.env.TESTOMATIO_PROJECT_ID ?? "";
}

export function mcpServerScript(): string {
  return require_.resolve("@testomatio/mcp/index.js");
}

/**
 * The one server pi's MCP extension connects, built from the environment.
 * Replaces pi's own config loading, so a CI clone cannot point the agent at an
 * MCP server of its own through `.pi/mcp.json`.
 */
export function mcpConfig(): LoadedMcpConfig {
  const env: Record<string, string> = {};
  if (process.env.TESTOMATIO_URL) env.TESTOMATIO_BASE_URL = process.env.TESTOMATIO_URL;

  return {
    servers: [
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
    ],
    errors: [],
  };
}
