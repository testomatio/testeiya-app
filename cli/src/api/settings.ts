import { join } from "node:path";
import { HOME_DIR } from "../project-dir.js";
import { mkdirSync } from "node:fs";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent";
import { loadConfig } from "../config.js";

/**
 * Settings API for the desktop app — lets the user supply the LLM provider
 * API key from an in-app Settings UI instead of an environment variable.
 *
 * The key is persisted via the SDK's AuthStorage to ~/.testeiya/auth.json,
 * which `createTesteiyaSession` already reads from. The key itself is never
 * returned to the client — only whether one is configured.
 */

function agentDir(): string {
  const dir = HOME_DIR;
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function openAuthStorage(): Promise<AuthStorage> {
  const auth = await AuthStorage.create(join(agentDir(), "auth.json"));
  // create() does not load persisted credentials into memory; reload so stored
  // keys are visible (not just env-var keys).
  await auth.reload();
  return auth;
}

export async function settingsGet(): Promise<Response> {
  const config = loadConfig();
  const provider = config.provider.name;
  const auth = await openAuthStorage();
  // `hasAuth` also counts an env var / runtime override, so a dev export still
  // reports "configured" when the key comes from the environment.
  const configured = auth.hasAuth(provider);
  return Response.json({
    configured,
    provider,
    model: config.provider.model,
    baseUrl: config.provider.baseUrl,
  });
}

export async function settingsPost(request: Request): Promise<Response> {
  let body: { apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return Response.json({ error: "apiKey is required" }, { status: 400 });
  }

  const provider = loadConfig().provider.name;
  const auth = await openAuthStorage();
  await auth.set(provider, { type: "api_key", key: apiKey });

  return Response.json({ ok: true, provider, configured: true });
}
