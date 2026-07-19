import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { HOME_DIR } from "./project-dir.js";
import { parseEnv } from "./load-env.js";

/**
 * User-managed environment variables, edited as raw `KEY=value` text in the
 * Settings UI and persisted to `~/.testeiya/.env` — the same file `load-env.ts`
 * loads at startup (so a provider key like OPENROUTER_API_KEY resolves) and the
 * one `shell-env.ts` overlays onto every agent bash command. The keys are also
 * tracked here so the shell overlay knows which vars to inject live.
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

function readEnvFile(): string | null {
  if (!existsSync(ENV_PATH)) return null;
  try {
    return readFileSync(ENV_PATH, "utf8");
  } catch {
    return null;
  }
}
