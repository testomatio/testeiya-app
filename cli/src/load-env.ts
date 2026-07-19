import { existsSync, readFileSync } from "node:fs";
import { HOME_DIR } from "./project-dir.js";
import { dirname, join } from "node:path";

/**
 * Load `.env` files into process.env for the agent server.
 *
 * Bun only auto-loads `.env` from the process CWD, but the Electrobun app runs
 * with its CWD set to the bundle's bin dir — so the project's `.env` (which
 * holds OPENROUTER_API_KEY in dev) is never picked up. This loader fixes that:
 *
 *   1. `~/.testeiya/.env`        — stable location that works for packaged apps
 *   2. walking up from this file — finds the repo's `.env` and `testeiya/.env`
 *      in dev (the bundled code sits a few levels under the project root)
 *
 * Existing process.env values always win (exported vars / Bun's CWD autoload),
 * so this only *fills gaps*. In a packaged install there's usually no project
 * `.env` up the tree, so it's a harmless no-op and the user uses Settings.
 */

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

function loadFile(path: string): boolean {
  try {
    if (!existsSync(path)) return false;
    const vars = parseEnv(readFileSync(path, "utf8"));
    let applied = 0;
    for (const [k, v] of Object.entries(vars)) {
      if (process.env[k] === undefined) {
        process.env[k] = v;
        applied++;
      }
    }
    if (applied > 0) console.log(`[env] loaded ${applied} var(s) from ${path}`);
    return applied > 0;
  } catch {
    return false;
  }
}

export function loadEnvFiles(): void {
  loadFile(join(HOME_DIR, ".env"));

  let dir = import.meta.dir;
  for (let i = 0; i < 8; i++) {
    loadFile(join(dir, ".env"));
    loadFile(join(dir, "testeiya", ".env"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
