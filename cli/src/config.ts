import { readFileSync, existsSync } from "node:fs";
import { updateJson } from "./json-store.js";
import { join } from "node:path";
import { HOME_DIR } from "./project-dir.js";

export const TESTEIYA_DIR_NAME = ".testeiya";

// Mirrors the SDK's ThinkingLevel string values (`@oh-my-pi/pi-agent-core`),
// minus "inherit" (not meaningful as a standalone default). `off` disables
// reasoning; higher levels stream more thinking. Reasoning only appears for
// models that support it — the SDK no-ops this for non-reasoning models.
export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export const THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

export interface TesteiyaConfig {
  provider: {
    name: string;
    baseUrl: string;
    model: string;
    contextWindow: number;
    maxTokens: number;
  };
  // How much reasoning the agent should stream (shown in the UI thinking block).
  thinkingLevel: ThinkingLevel;
  permissions: {
    autoAllowRead: boolean;
    blockWrites: boolean;
    blockBash: boolean;
  };
  // Per-project autonomous memory (the SDK's `memories.enabled`). On by default;
  // toggled from the in-app Settings dialog.
  memoryEnabled: boolean;
  // Testomat.io base URL, set in the in-app Settings. Left unset by default so
  // the auth layer falls through to `TESTOMATIO_URL` then `app.testomat.io`; a
  // saved value here overrides the env var.
  testomatioHost?: string;
  // Per-MCP-server overrides for the tool gate (see extensions/tool-gate.ts):
  // server name → glob patterns over original tool names to keep active;
  // everything else on that server is deferred. Replaces the heuristics.
  toolGate?: {
    activeTools?: Record<string, string[]>;
  };
}

const DEFAULT_CONFIG: TesteiyaConfig = {
  provider: {
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4",
    contextWindow: 200000,
    maxTokens: 16384,
  },
  thinkingLevel: "medium",
  permissions: {
    autoAllowRead: true,
    blockWrites: true,
    blockBash: true,
  },
  memoryEnabled: true,
};

export function loadConfig(): TesteiyaConfig {
  // Layered, lowest → highest precedence:
  //   defaults  <  project file (testeiya.config.json)  <  user file (~/.testeiya/config.json)
  // The user file is what the in-app Providers & Models UI writes, so it MUST
  // win over a committed project-level config (used for dev defaults) — earlier
  // this returned the first file found, so a repo testeiya.config.json silently
  // overrode the user's selection.
  const layers = [
    join(process.cwd(), "testeiya.config.json"),
    join(HOME_DIR, "config.json"),
  ];

  let provider = { ...DEFAULT_CONFIG.provider };
  let permissions = { ...DEFAULT_CONFIG.permissions };
  let thinkingLevel = DEFAULT_CONFIG.thinkingLevel;
  let memoryEnabled = DEFAULT_CONFIG.memoryEnabled;
  let testomatioHost = DEFAULT_CONFIG.testomatioHost;

  for (const path of layers) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      if (raw.provider) provider = { ...provider, ...raw.provider };
      if (raw.permissions) permissions = { ...permissions, ...raw.permissions };
      if (THINKING_LEVELS.includes(raw.thinkingLevel)) {
        thinkingLevel = raw.thinkingLevel;
      }
      if (typeof raw.memoryEnabled === "boolean") memoryEnabled = raw.memoryEnabled;
      if (typeof raw.testomatioHost === "string" && raw.testomatioHost.trim()) {
        testomatioHost = raw.testomatioHost.trim();
      }
    } catch {
      console.warn(`Warning: Failed to parse config at ${path}, ignoring it.`);
    }
  }

  return { provider, permissions, thinkingLevel, memoryEnabled, testomatioHost };
}

/** Path to the user-level config the UI writes to. */
function userConfigPath(): string {
  return join(HOME_DIR, "config.json");
}

/**
 * Persist the active provider + model chosen in the UI into
 * `~/.testeiya/config.json` (read-modify-write, preserving any other keys).
 * `loadConfig()` already merges this file over the defaults.
 *
 * Note: a committed repo `testeiya.config.json` (dev only) has higher precedence
 * in `loadConfig()`, so in dev that file would still win — the home file is the
 * persistent store for packaged installs and normal use.
 */
export function saveProviderSelection(selection: {
  provider: string;
  model: string;
}): void {
  updateJson<Record<string, unknown>>(userConfigPath(), {}, (existing) => {
    const prevProvider =
      existing.provider && typeof existing.provider === "object"
        ? (existing.provider as Record<string, unknown>)
        : {};
    return {
      ...existing,
      provider: {
        ...prevProvider,
        name: selection.provider,
        model: selection.model,
      },
    };
  });
}

/**
 * Persist the agent thinking level into `~/.testeiya/config.json`
 * (read-modify-write, preserving other keys). Applies on the next session.
 */
export function saveThinkingLevel(level: ThinkingLevel): void {
  updateJson<Record<string, unknown>>(userConfigPath(), {}, (existing) => ({
    ...existing,
    thinkingLevel: level,
  }));
}

/**
 * Persist whether per-project autonomous memory is enabled into
 * `~/.testeiya/config.json` (read-modify-write, preserving other keys). Applies
 * on the next session (session-factory reads it via `loadConfig`).
 */
export function saveMemoryEnabled(enabled: boolean): void {
  updateJson<Record<string, unknown>>(userConfigPath(), {}, (existing) => ({
    ...existing,
    memoryEnabled: enabled,
  }));
}

/**
 * Persist the Testomat.io base URL chosen in the in-app Settings into
 * `~/.testeiya/config.json` (read-modify-write, preserving other keys). An empty
 * string clears the override so the auth layer falls back to `TESTOMATIO_URL` /
 * the default host. Applies on the next status/connect call.
 */
export function saveTestomatioHost(host: string): void {
  updateJson<Record<string, unknown>>(userConfigPath(), {}, (existing) => ({
    ...existing,
    testomatioHost: host,
  }));
}
