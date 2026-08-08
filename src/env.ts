import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Testeiya's state directory, shared with the desktop app: a provider key saved
 * in its Settings dialog works here with no extra step.
 */
export const TESTEIYA_HOME = join(homedir(), ".testeiya");

/**
 * Where pi keeps its own state for this CLI. Deliberately not `~/.pi` — running
 * `npx testeiya` must not write into a user's own pi installation.
 */
export const PI_STATE_DIR = join(TESTEIYA_HOME, "pi");

/**
 * Fill gaps in process.env from `~/.testeiya/.env`, then from any `.env` found
 * walking up from the working directory — so running in a repo picks up that
 * repo's key. Exported variables always win; this only fills gaps.
 *
 * The walk starts at cwd, never at this file: an installed package sits under
 * some node_modules whose ancestors are none of the agent's business, and
 * silently adopting a key from there is a surprise, not a convenience.
 */
export function loadEnvFiles(): void {
  loadFile(join(TESTEIYA_HOME, ".env"));

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    loadFile(join(dir, ".env"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
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

function loadFile(path: string): void {
  if (!existsSync(path)) return;
  let vars: Record<string, string>;
  try {
    vars = parseEnv(readFileSync(path, "utf8"));
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(vars)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
