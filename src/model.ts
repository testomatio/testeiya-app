import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { TESTEIYA_HOME } from "./env.js";

/**
 * Last resort, so `npx testeiya` on a clean machine with only
 * OPENROUTER_API_KEY set still runs.
 */
export const DEFAULT_MODEL = { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" };

/** Provider key env vars, in the order a bare run should try them. */
export const PROVIDER_KEYS: Array<{ provider: string; env: string }> = [
  { provider: "openrouter", env: "OPENROUTER_API_KEY" },
  { provider: "anthropic", env: "ANTHROPIC_API_KEY" },
  { provider: "openai", env: "OPENAI_API_KEY" },
  { provider: "google", env: "GEMINI_API_KEY" },
];

/** Bad usage — the caller prints the message and exits 2, never prompting. */
export class UsageError extends Error {}

/**
 * --model, then TESTEIYA_MODEL, then ~/.testeiya/config.json (written by the
 * desktop app), then the pinned default. A CI run must never fall through to a
 * prompt, so anything unresolvable throws instead.
 */
export function resolveModel(runtime: ModelRuntime, explicit?: string) {
  for (const candidate of [explicit, process.env.TESTEIYA_MODEL, configuredModel()]) {
    if (!candidate) continue;
    const parsed = splitModelId(candidate);
    if (!parsed) {
      throw new UsageError(`a model must be <provider>/<model-id>, got "${candidate}"`);
    }
    const model = runtime.getModel(parsed.provider, parsed.id);
    if (!model) {
      throw new UsageError(`unknown model "${parsed.id}" for provider "${parsed.provider}"`);
    }
    return requireAuth(runtime, model);
  }

  const fallback = runtime.getModel(DEFAULT_MODEL.provider, DEFAULT_MODEL.id);
  if (!fallback) {
    throw new UsageError(
      `the default model ${DEFAULT_MODEL.provider}/${DEFAULT_MODEL.id} is no longer served — ` +
        "pass --model <provider>/<id> or set TESTEIYA_MODEL"
    );
  }
  return requireAuth(runtime, fallback);
}

/** Hand the runtime whichever provider keys the environment resolved. */
export async function applyEnvKeys(runtime: ModelRuntime): Promise<void> {
  for (const { provider, env } of PROVIDER_KEYS) {
    const key = process.env[env];
    if (!key) continue;
    if (runtime.hasConfiguredAuth(provider)) continue;
    await runtime.setRuntimeApiKey(provider, key);
  }
}

// Without this the run reaches pi's own credential error, which points at a
// `/login` command this CLI does not have and at paths inside node_modules.
function requireAuth<T>(runtime: ModelRuntime, model: T & { provider: string; id: string }): T {
  if (runtime.hasConfiguredAuth(model.provider)) return model;
  const known = PROVIDER_KEYS.find((k) => k.provider === model.provider);
  let how = `save a key for "${model.provider}" in ~/.testeiya/auth.json`;
  if (known) how = `set ${known.env} in the environment or ~/.testeiya/.env`;
  throw new UsageError(`no API key for ${model.provider} (model ${model.id}) — ${how}`);
}

function configuredModel(): string | undefined {
  const config = readJson(join(TESTEIYA_HOME, "config.json"));
  if (!config?.provider || !config?.model) return undefined;
  return `${config.provider}/${config.model}`;
}

// Splits on the FIRST slash — OpenRouter model ids contain slashes themselves.
function splitModelId(value: string): { provider: string; id: string } | null {
  const slash = value.indexOf("/");
  if (slash <= 0) return null;
  const provider = value.slice(0, slash);
  const id = value.slice(slash + 1);
  if (!id) return null;
  return { provider, id };
}

function readJson(path: string): Record<string, string> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
