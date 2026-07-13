// Resolve a workspace to a Testomat.io v2 call target — token, base URL, and the
// project identifier (slug or id) for the `/api/v2/{project}/...` path — and a
// thin DELETE helper. Shared by workspace sync (token + base URL only) and the
// file-delete endpoint (which also needs the project identifier and method).

import fs from "node:fs";
import path from "node:path";
import type { StoredSession } from "../session-store.js";
import { readProjectMeta } from "../workspace-model.js";
import { PROJECT_DIR } from "../project-dir.js";
import {
  loadStoredAuth,
  getCachedProjects,
  fetchProjects,
  normalizeBaseUrl,
} from "../testomatio-auth.js";
import { readEnvToken } from "./read-env-token.js";

export async function resolveProjectTarget(
  session: Pick<StoredSession, "tokens" | "backendUrl" | "projects">,
  cwd: string
): Promise<ProjectTarget | null> {
  // 1. A managed (project-pulled) session carries the project slug + token.
  const slug = session.projects?.[0]?.slug;
  const sessionToken = slug ? session.tokens?.[slug] : undefined;
  if (slug && sessionToken) {
    return { token: sessionToken, baseUrl: normalizeBaseUrl(session.backendUrl), project: slug };
  }

  // 2. A linked folder: recover the project from `.testeiya/testeiya.json` and
  //    resolve its write-token from the connected account.
  const meta = readProjectMeta(cwd);
  const stored = loadStoredAuth();
  if (meta && stored?.token) {
    const baseUrl = normalizeBaseUrl(meta.baseUrl || stored.baseUrl);
    const token = await projectApiKey(stored.token, baseUrl, meta.projectId);
    if (token) return { token, baseUrl, project: meta.projectId };
  }

  // 3. An unlinked folder, but an account is connected with a currently-selected
  //    project: use that project's write-token + base URL. This is what makes a
  //    plain folder sync against the connected project instead of falling back
  //    to whatever stale token happens to sit in the folder's own `.env`.
  if (stored?.token && stored.projectId) {
    const baseUrl = normalizeBaseUrl(stored.baseUrl);
    const token = await projectApiKey(stored.token, baseUrl, stored.projectId);
    if (token) return { token, baseUrl, project: stored.projectId };
  }

  // 4. A folder's own `.env` carries a token but not a project id, so the v2
  //    REST path can't be built — usable for sync, not for a targeted delete.
  return null;
}

export async function deleteTestomatioResource(
  target: ProjectTarget,
  resource: "suites" | "tests",
  id: string
): Promise<boolean> {
  const res = await mutate(target, "DELETE", resource, id);
  // 404 = already gone upstream; treat as success so a stale local file deletes.
  return res.ok || res.status === 404;
}

export async function updateTestomatioResource(
  target: ProjectTarget,
  resource: "suites" | "tests",
  id: string,
  body: Record<string, unknown>
): Promise<boolean> {
  const res = await mutate(target, "PUT", resource, id, body);
  // 404 = gone upstream; nothing to update, so the local rename can still proceed.
  return res.ok || res.status === 404;
}

/** Token + base URL for a workspace, ignoring the project identifier (sync use). */
export async function resolveProjectCreds(
  session: Pick<StoredSession, "tokens" | "backendUrl" | "projects">,
  cwd: string
): Promise<{ token: string; baseUrl: string } | null> {
  const target = await resolveProjectTarget(session, cwd);
  if (target) return { token: target.token, baseUrl: target.baseUrl };
  return readEnvToken(cwd);
}

/**
 * The `TESTOMATIO*` env vars a session's shell commands should run with —
 * resolved from any workspace shape: managed session tokens, a linked folder,
 * the connected account, the folder's own `.env`, or a `.testeiya/mcp.json`
 * whose testomatio server already embeds the token in its `--token` arg.
 */
export async function resolveSessionShellEnv(
  session: Pick<StoredSession, "tokens" | "backendUrl" | "projects">,
  cwd: string
): Promise<SessionShellEnv | null> {
  const meta = readProjectMeta(cwd);
  const target = await resolveProjectTarget(session, cwd);
  if (target) {
    const env: Record<string, string> = {
      TESTOMATIO: target.token,
      TESTOMATIO_URL: target.baseUrl,
      TESTOMATIO_PROJECT_ID: target.project,
    };
    const slug = session.projects?.[0]?.slug;
    let source: SessionShellEnv["source"] = "account";
    if (slug && session.tokens?.[slug]) source = "managed";
    else if (meta) source = "linked";
    const resolved: SessionShellEnv = { env, source, projectId: target.project };
    if (meta?.projectId === target.project && meta.title) resolved.title = meta.title;
    return resolved;
  }

  const dotenv = readEnvToken(cwd);
  if (dotenv) {
    return {
      env: { TESTOMATIO: dotenv.token, TESTOMATIO_URL: dotenv.baseUrl },
      source: "dotenv",
    };
  }

  return readMcpToken(cwd);
}

async function mutate(
  target: ProjectTarget,
  method: "DELETE" | "PUT",
  resource: "suites" | "tests",
  id: string,
  body?: Record<string, unknown>
): Promise<Response> {
  const path = `/api/v2/${encodeURIComponent(target.project)}/${resource}/${encodeURIComponent(id)}`;
  const upstream = new URL(path, target.baseUrl);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${target.token}`,
    Accept: "application/json",
  };
  if (body) headers["Content-Type"] = "application/json";
  console.log(`[testomatio] → ${method} ${upstream.toString()}`);
  const res = await fetch(upstream.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  console.log(`[testomatio] ← ${res.status} ${method} ${resource}/${id}`);
  return res;
}

async function projectApiKey(
  jwt: string,
  baseUrl: string,
  projectId: string
): Promise<string | null> {
  let projects = getCachedProjects(jwt, baseUrl);
  if (!projects) {
    try {
      projects = await fetchProjects(jwt, baseUrl);
    } catch {
      return null;
    }
  }
  const project = projects.find((p) => p.id === projectId);
  if (!project?.apiKey) return null;
  return project.apiKey;
}

function readMcpToken(cwd: string): SessionShellEnv | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(cwd, PROJECT_DIR, "mcp.json"), "utf8");
  } catch {
    return null;
  }
  let servers: Record<string, { args?: unknown; env?: Record<string, string> }>;
  try {
    servers = JSON.parse(raw)?.mcpServers ?? {};
  } catch {
    return null;
  }

  const found: { token: string; project?: string; baseUrl?: string }[] = [];
  for (const [name, server] of Object.entries(servers)) {
    if (!name.startsWith("testomatio-")) continue;
    const args: string[] = [];
    if (Array.isArray(server?.args)) {
      for (const arg of server.args) args.push(String(arg));
    }
    const tokenIdx = args.indexOf("--token");
    if (tokenIdx < 0 || !args[tokenIdx + 1]) continue;
    const entry: { token: string; project?: string; baseUrl?: string } = {
      token: args[tokenIdx + 1],
      baseUrl: server.env?.TESTOMATIO_BASE_URL,
    };
    const projectIdx = args.indexOf("--project");
    if (projectIdx >= 0) entry.project = args[projectIdx + 1];
    found.push(entry);
  }
  // 2+ tokened servers = a multi-project workspace; no single TESTOMATIO is right.
  if (found.length !== 1) return null;

  const entry = found[0];
  const env: Record<string, string> = {
    TESTOMATIO: entry.token,
    TESTOMATIO_URL: normalizeBaseUrl(entry.baseUrl),
  };
  const resolved: SessionShellEnv = { env, source: "mcp" };
  if (entry.project) {
    env.TESTOMATIO_PROJECT_ID = entry.project;
    resolved.projectId = entry.project;
  }
  return resolved;
}

export interface ProjectTarget {
  token: string;
  baseUrl: string;
  project: string;
}

export interface SessionShellEnv {
  env: Record<string, string>;
  source: "managed" | "linked" | "account" | "dotenv" | "mcp";
  projectId?: string;
  title?: string;
}
