import { join } from "node:path";
import { HOME_DIR } from "../project-dir.js";
import { mkdirSync } from "node:fs";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent";
import { loadConfig } from "../config.js";
import { readUserEnvText, saveUserEnvText } from "../user-env.js";

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

/**
 * ENV Variables — raw `KEY=value` text the user manages in Settings, persisted
 * to `~/.testeiya/.env`. GET returns the current file (or a default template);
 * POST saves it and applies the vars to the process so agent bash commands and
 * the next session's provider-key resolution pick them up. Values are stored in
 * a local file the user controls, so unlike provider keys they round-trip here.
 */
export function settingsEnvGet(): Response {
  return Response.json({ env: readUserEnvText() });
}

export async function settingsEnvPost(request: Request): Promise<Response> {
  let body: { env?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.env !== "string") {
    return Response.json({ error: "env is required" }, { status: 400 });
  }
  const keys = saveUserEnvText(body.env);
  return Response.json({ ok: true, keys });
}
