import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { SavedModel } from "./sessions.js";

/** Provider key env vars the CLI picks up from the environment. */
export const PROVIDER_KEYS: Array<{ provider: string; env: string }> = [
  { provider: "openrouter", env: "OPENROUTER_API_KEY" },
  { provider: "anthropic", env: "ANTHROPIC_API_KEY" },
  { provider: "openai", env: "OPENAI_API_KEY" },
  { provider: "google", env: "GEMINI_API_KEY" },
];

/** Bad usage — the caller prints the message and exits 2, never prompting. */
export class UsageError extends Error {}

/**
 * --model, then TESTEIYA_MODEL, then the model a resumed session was running.
 * CI often has no model configured, so TESTEIYA_MODEL is the channel there. The
 * desktop app's `~/.testeiya/config.json` is not consulted — a CI run must not
 * depend on a choice made in someone's GUI. Anything unresolvable throws, so a
 * run never falls through to a prompt.
 */
export function resolveModel(runtime: ModelRuntime, explicit?: string, saved?: SavedModel | null) {
  const candidate = explicit || process.env.TESTEIYA_MODEL;
  let parsed = null;
  if (candidate) {
    parsed = splitModelId(candidate);
    if (!parsed) {
      throw new UsageError(`a model must be <provider>/<model-id>, got "${candidate}"`);
    }
  }
  if (!parsed && saved) parsed = { provider: saved.provider, id: saved.modelId };
  if (!parsed) {
    throw new UsageError("no model — pass --model <provider>/<id> or set TESTEIYA_MODEL");
  }
  const model = runtime.getModel(parsed.provider, parsed.id);
  if (!model) {
    throw new UsageError(`unknown model "${parsed.id}" for provider "${parsed.provider}"`);
  }
  return requireAuth(runtime, model);
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

// Splits on the FIRST slash — OpenRouter model ids contain slashes themselves.
function splitModelId(value: string): { provider: string; id: string } | null {
  const slash = value.indexOf("/");
  if (slash <= 0) return null;
  const provider = value.slice(0, slash);
  const id = value.slice(slash + 1);
  if (!id) return null;
  return { provider, id };
}
