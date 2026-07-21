import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { HOME_DIR, PROJECT_DIR } from "./project-dir.js";
import { parseEnv } from "./load-env.js";

/**
 * User-managed environment variables, edited as raw `KEY=value` text in the
 * Settings UI. Two scopes:
 *
 * - **Global** — `~/.testeiya/.env`, shared by every workspace. The same file
 *   `load-env.ts` loads at startup (so a provider key like OPENROUTER_API_KEY
 *   resolves) and the one `shell-env.ts` overlays onto every agent bash
 *   command. Saving applies the vars to the live process; the keys are also
 *   tracked here so the shell overlay knows which vars to inject.
 * - **Project** — `<cwd>/.testeiya/.env`, one per workspace. Never applied to
 *   the server process (sessions with other workspaces must not see it);
 *   `shell-env.ts` overlays it per session on top of the global vars, so a
 *   project value wins over a global one with the same name. The `.testeiya`
 *   dir is self-gitignored so the secrets stay out of the repo.
 */

const ENV_PATH = join(HOME_DIR, ".env");

// Always surfaced as empty slots in the textarea so the user has a place to
// paste the common LLM provider keys, even when the file holds other vars.
const DEFAULT_KEYS = ["OPENAI_API_KEY", "OPENROUTER_API_KEY"];

let cachedKeys: string[] | null = null;

export function readUserEnvText(): string {
  const raw = readEnvFile();
  const base = (raw?.trim() ? raw : "").replace(/\n+$/, "");
  const present = new Set(Object.keys(parseEnv(base)));
  const missing = DEFAULT_KEYS.filter((key) => !present.has(key)).map(
    (key) => `${key}=`,
  );
  const lines = base ? [base, ...missing] : missing;
  return `${lines.join("\n")}\n`;
}

export function saveUserEnvText(text: string): string[] {
  const previous = parseEnv(readEnvFile() ?? "");
  const next = parseEnv(text);
  const normalized = text.endsWith("\n") ? text : `${text}\n`;
  mkdirSync(HOME_DIR, { recursive: true });
  writeFileSync(ENV_PATH, normalized, { mode: 0o600 });
  for (const key of Object.keys(previous)) {
    if (!(key in next)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(next)) {
    if (value) process.env[key] = value;
    else delete process.env[key];
  }
  cachedKeys = Object.keys(next);
  return cachedKeys;
}

export function userEnvKeys(): string[] {
  if (cachedKeys) return cachedKeys;
  cachedKeys = Object.keys(parseEnv(readEnvFile() ?? ""));
  return cachedKeys;
}

export function readProjectEnvText(cwd: string): string {
  const raw = readEnvFile(projectEnvPath(cwd));
  if (!raw?.trim()) return "";
  return raw.endsWith("\n") ? raw : `${raw}\n`;
}

export function saveProjectEnvText(cwd: string, text: string): void {
  const dir = join(cwd, PROJECT_DIR);
  mkdirSync(dir, { recursive: true });
  const gitignore = join(dir, ".gitignore");
  if (!existsSync(gitignore)) writeFileSync(gitignore, "*\n", "utf8");
  const normalized = text.endsWith("\n") ? text : `${text}\n`;
  writeFileSync(projectEnvPath(cwd), normalized, { mode: 0o600 });
}

export function projectEnvVars(cwd: string): Record<string, string> {
  return parseEnv(readEnvFile(projectEnvPath(cwd)) ?? "");
}

function projectEnvPath(cwd: string): string {
  return join(cwd, PROJECT_DIR, ".env");
}

function readEnvFile(path = ENV_PATH): string | null {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
