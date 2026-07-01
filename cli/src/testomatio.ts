// Testomat.io environment/config parsing for the TUI agent.
// Loads `.env` (so TESTOMATIO* vars are available before the session starts),
// exposes the parsed config, and reports whether the Testomat.io MCP is wired up.

import { existsSync } from "node:fs";
import { join } from "node:path";

const ENV_FILES = [".env", ".env.local"];

/**
 * Load `.env` / `.env.local` from `cwd` into `process.env`.
 * Must run BEFORE createTesteiyaSession (it reads the provider API key and
 * the TESTOMATIO token from the environment). No-op if the file is missing.
 */
export function loadDotEnv(cwd = process.cwd()): void {
  for (const file of ENV_FILES) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;
    try {
      // Node ≥ 20.12 / 22 built-in — no dotenv dependency needed.
      process.loadEnvFile(path);
    } catch {
      // Older Node or a parse error — env may still be set another way; ignore.
    }
  }
}

export interface TestomatioConfig {
  /** `TESTOMATIO` — the API key handed to bash/skills. */
  token?: string;
  /** `TESTOMATIO_URL` — backend URL override. */
  url?: string;
  /** `TESTOMATIO_PROJECT_ID` (or legacy `TESTOMATIO_PROJECT`). */
  projectId?: string;
  /** `TESTOMATIO_PROJECT_TOKEN` — per-project token used by the MCP server. */
  projectToken?: string;
  /** `TESTOMATIO_BASE_URL` — base URL passed to the MCP server. */
  baseUrl?: string;
}

/** Parse all TESTOMATIO* vars out of the current environment. */
export function getTestomatioConfig(): TestomatioConfig {
  const e = process.env;
  return {
    token: e.TESTOMATIO,
    url: e.TESTOMATIO_URL,
    projectId: e.TESTOMATIO_PROJECT_ID ?? e.TESTOMATIO_PROJECT,
    projectToken: e.TESTOMATIO_PROJECT_TOKEN,
    baseUrl: e.TESTOMATIO_BASE_URL,
  };
}

/** Whether a `TESTOMATIO` key is present. */
export function hasTestomatioKey(cfg: TestomatioConfig = getTestomatioConfig()): boolean {
  return Boolean(cfg.token && cfg.token.trim());
}

/** Mask a token for display: first 4 + last 4, never the middle. */
export function maskToken(token?: string): string {
  if (!token) return "";
  return token.length <= 8 ? "****" : `${token.slice(0, 4)}…${token.slice(-4)}`;
}

interface McpLike {
  getConnectionStatus?(name: string): string;
  getTools?(): Array<{ name?: string; mcpServerName?: string }>;
}

/**
 * True if the Testomat.io MCP server is connected (its tools are loaded).
 * Checks loaded tools' `mcpServerName`/`name`, then known server names.
 */
export function isTestomatioMcpEnabled(mcp: McpLike | undefined): boolean {
  if (!mcp) return false;
  const re = /testomat/i;
  const tools = mcp.getTools?.() ?? [];
  if (tools.some(t => re.test(t?.mcpServerName ?? "") || re.test(t?.name ?? ""))) {
    return true;
  }
  for (const name of ["testomat-mcp", "testomatio"]) {
    if (mcp.getConnectionStatus?.(name) === "connected") return true;
  }
  return false;
}

/**
 * One-line status summary for the startup banner, or null if no key is set.
 * e.g. "within Testomat.io project 1a2b3c4d (token tstm…ab12) · MCP enabled"
 */
export function testomatioStatusLine(
  mcp: McpLike | undefined,
  cfg: TestomatioConfig = getTestomatioConfig(),
): string | null {
  if (!hasTestomatioKey(cfg)) return null;
  const where = cfg.projectId ? ` ${cfg.projectId}` : "";
  const mcpState = isTestomatioMcpEnabled(mcp) ? "MCP enabled" : "MCP not connected";
  return `within Testomat.io project${where} (token ${maskToken(cfg.token)}) · ${mcpState}`;
}
