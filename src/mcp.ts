import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TmsAccess } from "../prompt/testomatio.js";
import { PI_STATE_DIR } from "./env.js";

const require_ = createRequire(import.meta.url);

export const SERVER = "testomatio";

/**
 * Promoted to their own tools instead of going through the proxy: the reads the
 * skills reach for constantly. @testomatio/mcp exposes 90 tools and registering
 * them all would cost roughly 15k tokens of system prompt, which is the bloat
 * the proxy exists to avoid. Everything else stays reachable through `mcp`.
 */
export const DIRECT_TOOLS = [
  "tests_list",
  "tests_get",
  "tests_search",
  "suites_list",
  "suites_get",
  "runs_list",
  "runs_get",
  "testruns_list",
  "plans_list",
  "plans_get",
  "labels_list",
];

/**
 * The Testomat.io MCP server needs a project id as well as a token — a token on
 * its own does not identify a project to it. Without one the agent still reaches
 * the project through `check-tests` and REST, which need only the token, so the
 * prompt says exactly that instead of naming tools that are not there.
 */
export function tmsAccess(): TmsAccess {
  if (hasMcp()) return "mcp-proxy";
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

/**
 * An in-memory server definition built from the environment. Deliberately not
 * discovered from the checkout: a CI clone must not be able to point the agent
 * at an MCP server of its own.
 */
export function mcpConfig(): McpConfig {
  const args = [
    require_.resolve("@testomatio/mcp/index.js"),
    "--token",
    process.env.TESTOMATIO ?? "",
    "--project",
    projectId(),
  ];
  const env: Record<string, string> = {};
  if (process.env.TESTOMATIO_URL) env.TESTOMATIO_BASE_URL = process.env.TESTOMATIO_URL;

  return {
    mcpServers: {
      [SERVER]: {
        command: process.execPath,
        args,
        env,
        lifecycle: "lazy",
        directTools: DIRECT_TOOLS,
      },
    },
  };
}

export function metadataCachePath(): string {
  return join(PI_STATE_DIR, "mcp-cache.json");
}

/**
 * The MCP adapter, bundled at build time (see scripts/vendor-entry.ts). The
 * specifier is built at runtime so it is never resolved at compile time — the
 * bundle only exists after a build.
 */
export function vendorBundle(): string {
  return pathToFileURL(join(import.meta.dirname, "..", "vendor", "mcp.js")).href;
}

/**
 * Direct tools are registered from the adapter's metadata cache, which does not
 * exist on a fresh CI runner — so a first run would degrade to proxy-only. The
 * tool metadata ships with this package as mcp-tools.json (generated from
 * @testomatio/mcp's own definitions), and this writes it as a cache entry.
 *
 * The entry is keyed by a hash of the resolved server definition, so the hash
 * comes from the adapter's own bundled code rather than a copy of its logic — a
 * mismatch would silently invalidate the seed. A failure here is not fatal: the
 * run continues proxy-only, which still works.
 */
export async function seedMetadataCache(config: McpConfig): Promise<void> {
  const cachePath = metadataCachePath();
  if (existsSync(cachePath)) return;

  const tools = readSeedTools();
  if (tools.length === 0) return;

  const hash = await computeServerHash(config.mcpServers[SERVER]);
  if (!hash) return;

  const cache = {
    version: 1,
    servers: {
      [SERVER]: {
        configHash: hash,
        tools,
        resources: [],
        cachedAt: Date.now(),
      },
    },
  };
  mkdirSync(PI_STATE_DIR, { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function readSeedTools(): SeedTool[] {
  const path = join(import.meta.dirname, "..", "..", "mcp-tools.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

async function computeServerHash(definition: unknown): Promise<string | null> {
  try {
    const vendor = (await import(vendorBundle())) as {
      computeServerHash: (definition: unknown) => string;
    };
    return vendor.computeServerHash(definition);
  } catch {
    return null;
  }
}

export interface SeedTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpConfig {
  mcpServers: Record<string, Record<string, unknown>>;
}
