import { join } from "node:path";
import { HOME_DIR } from "../project-dir.js";
import { mkdirSync } from "node:fs";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent";
import { loadConfig } from "../config.js";
import { getSession } from "../session-store.js";
import {
  readUserEnvText,
  saveUserEnvText,
  readProjectEnvText,
  saveProjectEnvText,
} from "../user-env.js";

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
 * ENV Variables — raw `KEY=value` text the user manages in Settings, in two
 * scopes. Global (default): `~/.testeiya/.env`; saving applies the vars to the
 * process so agent bash commands and the next session's provider-key resolution
 * pick them up. Project (`?scope=project` + `session`): the workspace's
 * `.testeiya/.env`, resolved via the session's cwd; it only reaches that
 * workspace's shell commands (see shell-env.ts), never the server process.
 * Values are stored in local files the user controls, so unlike provider keys
 * they round-trip here.
 */
export function settingsEnvGet(request: Request): Response {
  const url = new URL(request.url);
  if (url.searchParams.get("scope") !== "project") {
    return Response.json({ env: readUserEnvText(), scope: "global" });
  }
  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    return Response.json({ error: "session required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  return Response.json({ env: readProjectEnvText(session.cwd), scope: "project" });
}

export async function settingsEnvPost(request: Request): Promise<Response> {
  let body: { env?: string; scope?: string; session?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.env !== "string") {
    return Response.json({ error: "env is required" }, { status: 400 });
  }
  if (body.scope !== "project") {
    const keys = saveUserEnvText(body.env);
    return Response.json({ ok: true, keys });
  }
  if (!body.session) {
    return Response.json({ error: "session required" }, { status: 400 });
  }
  const session = getSession(body.session);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  saveProjectEnvText(session.cwd, body.env);
  return Response.json({ ok: true });
}
