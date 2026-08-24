import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Testeiya's state directory, shared with the desktop app: a provider key saved
 * in its Settings dialog works here with no extra step.
 */
export const TESTEIYA_HOME = join(homedir(), ".testeiya");

/**
 * This package's root, found by walking up to package.json — `dist/src` when
 * built, `src` when run from source. Bundled files resolve from here.
 */
export const PACKAGE_ROOT = packageRoot();

/** This package's version, read from the same package.json. */
export const VERSION = packageVersion();

/**
 * Where pi keeps its own state for this CLI. Deliberately not `~/.pi` — running
 * `npx testeiya` must not write into a user's own pi installation.
 */
export const PI_STATE_DIR = join(TESTEIYA_HOME, "pi");

// pi reads this at import time to place sessions and its MCP cache, and a
// SessionManager is built before any session exists to read it from.
process.env.PI_CODING_AGENT_DIR = PI_STATE_DIR;

/**
 * Fill gaps in process.env from `~/.testeiya/.env`, then from any `.env` found
 * walking up from the working directory — so running in a repo picks up that
 * repo's key. Exported variables always win; this only fills gaps.
 *
 * The walk starts at cwd, never at this file: an installed package sits under
 * some node_modules whose ancestors are none of the agent's business, and
 * silently adopting a key from there is a surprise, not a convenience.
 *
 * Returns the file each variable came from, which is what `doctor` reports.
 */
export function loadEnvFiles(): Map<string, string> {
  const sources = new Map<string, string>();
  loadFile(join(TESTEIYA_HOME, ".env"), sources);

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    loadFile(join(dir, ".env"), sources);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return sources;
}

export function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function loadFile(path: string, sources: Map<string, string>): void {
  if (!existsSync(path)) return;
  let vars: Record<string, string>;
  try {
    vars = parseEnv(readFileSync(path, "utf8"));
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(vars)) {
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
    sources.set(key, path);
  }
}

function packageVersion(): string {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version ?? "";
  } catch {
    return "";
  }
}

function packageRoot(): string {
  let dir = import.meta.dirname;
  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) return import.meta.dirname;
    dir = parent;
  }
  return dir;
}
