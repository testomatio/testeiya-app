// HTTP API for the in-app Testomat.io login flow.
//
//   GET    /api/auth/testomatio          → connection status + project list
//   POST   /api/auth/testomatio          → connect with a pasted JWT
//   DELETE /api/auth/testomatio          → log out (forget the stored token)
//   POST   /api/auth/testomatio/session  → create a session for a chosen project
//
// The token never leaves the server — the client only ever sees whether a
// connection exists and the (id, title, framework) of accessible projects.

import fs from "node:fs";
import {
  loadStoredAuth,
  saveStoredAuth,
  clearStoredAuth,
  fetchProjects,
  getCachedProjects,
  signInUrl,
  normalizeBaseUrl,
  maskToken,
  UnauthorizedError,
  type Project,
} from "../testomatio-auth.js";
import { createProjectSession, projectWorkspaceDir } from "./agent-start.js";
import { getSession } from "../session-store.js";
import { loadConfig, saveTestomatioHost } from "../config.js";

/** Public, token-free view of a project for the client. */
function publicProject(p: Project) {
  return { id: p.id, title: p.title, framework: p.framework, testsCount: p.testsCount };
}

export async function testomatioAuthGet(): Promise<Response> {
  const stored = loadStoredAuth();
  // Base URL precedence: the in-app Settings host (config.json) wins, then
  // TESTOMATIO_URL (.env), then the app.testomat.io default — see normalizeBaseUrl.
  const baseUrl = normalizeBaseUrl(loadConfig().testomatioHost);

  if (!stored?.token) {
    console.log(`[tio-auth] status: not connected (base ${baseUrl})`);
    return Response.json({
      connected: false,
      baseUrl,
      signInUrl: signInUrl(baseUrl),
    });
  }

  try {
    const projects = await fetchProjects(stored.token, baseUrl);
    const selectedProjectId =
      stored.projectId && projects.some((p) => p.id === stored.projectId)
        ? stored.projectId
        : undefined;
    console.log(
      `[tio-auth] status: connected, ${projects.length} project(s)` +
        (selectedProjectId ? `, selected ${selectedProjectId}` : "")
    );
    return Response.json({
      connected: true,
      baseUrl,
      signInUrl: signInUrl(baseUrl),
      selectedProjectId,
      projects: projects.map(publicProject),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      // The stored token is no longer valid — surface as disconnected so the
      // UI re-prompts (it tells the user the previous token was rejected).
      console.warn(`[tio-auth] status: stored token rejected by ${baseUrl}`);
      return Response.json({
        connected: false,
        rejected: true,
        baseUrl,
        signInUrl: signInUrl(baseUrl),
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tio-auth] status check failed: ${message}`);
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function testomatioAuthPost(request: Request): Promise<Response> {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    console.warn("[tio-auth] connect rejected: empty token");
    return Response.json({ error: "token is required" }, { status: 400 });
  }
  if (!token.startsWith("eyJ")) {
    console.warn(`[tio-auth] connect rejected: token ${maskToken(token)} is not a JWT`);
    return Response.json(
      { error: "That doesn't look like a JWT (expected to start with 'eyJ')." },
      { status: 400 }
    );
  }

  // Settings host (config.json) → TESTOMATIO_URL → app.testomat.io default.
  const baseUrl = normalizeBaseUrl(loadConfig().testomatioHost);
  console.log(`[tio-auth] connect: validating token ${maskToken(token)} against ${baseUrl}`);

  let projects: Project[];
  try {
    projects = await fetchProjects(token, baseUrl);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      console.warn(`[tio-auth] connect: token ${maskToken(token)} rejected by ${baseUrl}`);
      return Response.json(
        { error: "Testomat.io rejected this token. Generate a fresh one and try again." },
        { status: 401 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tio-auth] connect failed: ${message}`);
    return Response.json({ error: message }, { status: 502 });
  }

  // Preserve a still-valid project selection across reconnects.
  const previous = loadStoredAuth();
  const projectId =
    previous?.projectId && projects.some((p) => p.id === previous.projectId)
      ? previous.projectId
      : undefined;
  saveStoredAuth({ token, baseUrl, projectId });
  console.log(
    `[tio-auth] connected: ${projects.length} project(s) available` +
      (projectId ? `, remembered selection ${projectId}` : "")
  );

  return Response.json({
    connected: true,
    baseUrl,
    selectedProjectId: projectId,
    projects: projects.map(publicProject),
  });
}

export async function testomatioAuthDelete(): Promise<Response> {
  console.log("[tio-auth] logout: cleared stored token");
  clearStoredAuth();
  return Response.json({ connected: false });
}

/**
 * Persist the Testomat.io host chosen in Settings. An empty host clears the
 * override (falls back to TESTOMATIO_URL / the default). Returns the resolved
 * base URL + sign-in URL so the client can update its connection state.
 */
export async function testomatioHostPost(request: Request): Promise<Response> {
  let body: { host?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const host = body.host?.trim();
  const baseUrl = normalizeBaseUrl(host);
  saveTestomatioHost(host ? baseUrl : "");
  console.log(`[tio-auth] host ${host ? `set to ${baseUrl}` : "cleared (using default)"}`);
  return Response.json({ baseUrl, signInUrl: signInUrl(baseUrl) });
}

/**
 * Create an agent session for a chosen project. Resolves the project from the
 * stored JWT, persists the selection, then reuses `createProjectSession` to
 * pull tests + wire the Testomat.io MCP server — yielding a `sessionId` the UI
 * connects to exactly like an external `/api/agent/start` caller would.
 */
export async function testomatioAuthSession(request: Request): Promise<Response> {
  let body: { projectId?: string; fromSession?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const stored = loadStoredAuth();
  if (!stored?.token) {
    return Response.json(
      { error: "Not connected to Testomat.io." },
      { status: 401 }
    );
  }

  const baseUrl = normalizeBaseUrl(loadConfig().testomatioHost);

  // Resolve the project from the precache so opening never blocks on the slow
  // /api/projects download. Only fall back to the network when nothing is
  // cached (e.g. the very first launch). When we do use the cache, refresh it
  // in the background so api_key rotations are eventually picked up.
  let projects = getCachedProjects(stored.token, baseUrl);
  if (projects) {
    console.log(`[tio-auth] session: resolved project from cache (${projects.length})`);
    void fetchProjects(stored.token, baseUrl, { force: true }).catch(() => {});
  } else {
    try {
      projects = await fetchProjects(stored.token, baseUrl);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        clearStoredAuth();
        return Response.json(
          { error: "Testomat.io token was rejected. Please reconnect." },
          { status: 401 }
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ error: message }, { status: 502 });
    }
  }

  const wantedId = body.projectId || stored.projectId;
  const project =
    (wantedId && projects.find((p) => p.id === wantedId)) ||
    (projects.length === 1 ? projects[0] : undefined);

  if (!project) {
    console.warn(
      `[tio-auth] session: no project resolved (wanted ${wantedId ?? "—"}, ${projects.length} available)`
    );
    return Response.json(
      { error: "projectId is required (multiple projects available)." },
      { status: 400 }
    );
  }

  saveStoredAuth({ ...stored, baseUrl, projectId: project.id });

  // Where the project's tests land:
  //  - The user opened this workspace themselves — a folder they picked or the
  //    `TESTEIYA_WORKSPACE` env dir (both `trusted`): stay there and overlay
  //    tests into `.testeiya/manual-tests`. Connecting a project must never move
  //    the user out of a directory they chose.
  //  - Otherwise (empty: no current workspace, or a managed / pulled one) use a
  //    dedicated, reusable per-project workspace so a known project opens
  //    instantly from the same dir.
  let workspaceDir = projectWorkspaceDir(project.id);
  let overlay = false;
  const from = body.fromSession ? getSession(body.fromSession) : null;
  if (from?.trusted && fs.existsSync(from.cwd)) {
    workspaceDir = from.cwd;
    overlay = true;
  }
  console.log(
    `[tio-auth] session: opening project ${project.title} (${project.id}) at ${workspaceDir}${
      overlay ? " (overlay)" : ""
    }`
  );

  const result = await createProjectSession(
    [{ slug: project.id, title: project.title, token: project.apiKey }],
    { backendUrl: baseUrl, workspaceDir, background: true, overlay, trusted: overlay }
  );

  console.log(
    `[tio-auth] session ${result.sessionId} created for ${project.id} at ${result.cwd}`
  );

  return Response.json({
    ...result,
    project: { id: project.id, title: project.title },
  });
}
