// Testomat.io user-scope JWT bootstrap for the web/desktop app.
//
// Ported from the TUI's `src/testomatio-auth.ts` (testomatio/testeiya#11) but
// trimmed to the pieces a UI flow needs — there are no terminal prompts here.
// The HTTP layer in `api/testomatio-auth.ts` drives the actual login UI.
//
// Flow:
//   1. The user opens `${baseUrl}/app-auth`, signs in, copies the
//      pasted token, and submits it from the onboarding screen.
//   2. We GET /api/projects with that JWT to enumerate accessible projects.
//   3. The chosen project's per-project `api_key` (`tstmt_...`) is what MCP /
//      check-tests already expect on the `TESTOMATIO` env var.
//
// The user JWT (`eyJ...`) is user-scoped and long-lived. We persist it to
// `~/.testeiya/testomatio-auth.json` (mode 0600) — deliberately a SEPARATE file
// from `~/.testeiya/auth.json`, which the SDK's `AuthStorage` owns for the LLM
// provider key. Writing our own JSON into that file would corrupt it.

import { rmSync } from "node:fs";
import { HOME_DIR } from "./project-dir.js";
import { readJson, writeJson } from "./json-store.js";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";

const AUTH_FILE = join(HOME_DIR, "testomatio-auth.json");
// Persistent precache of the (slow) project list — survives app restarts, so
// opening a project never waits on a network round-trip. Holds full projects
// incl. api_key, same trust level as the JWT in AUTH_FILE, so mode 0600.
const PROJECTS_CACHE_FILE = join(HOME_DIR, "testomatio-projects.json");
export const DEFAULT_BASE_URL = "https://app.testomat.io";

export interface StoredAuth {
  token: string;
  baseUrl: string;
  projectId?: string;
}

export interface Project {
  id: string;
  title: string;
  apiKey: string;
  framework?: string;
  testsCount?: number;
}

export class UnauthorizedError extends Error {
  constructor(message = "Testomat.io rejected the stored token.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Strip a trailing slash so `${baseUrl}/path` never doubles up. */
export function normalizeBaseUrl(url?: string): string {
  const raw = (url || process.env.TESTOMATIO_URL || DEFAULT_BASE_URL).trim();
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** Browser URL the user opens to mint a JWT for the app. */
export function signInUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/app-auth?app_name=Testeiya`;
}

export function loadStoredAuth(): StoredAuth | null {
  const raw = readJson<Partial<StoredAuth>>(AUTH_FILE, {});
  if (typeof raw?.token !== "string" || !raw.token.trim()) return null;
  return {
    token: raw.token,
    baseUrl: raw.baseUrl || DEFAULT_BASE_URL,
    projectId: typeof raw.projectId === "string" ? raw.projectId : undefined,
  };
}

export function saveStoredAuth(auth: StoredAuth): void {
  // mode 0o600: same trust level as the JWT it stores.
  writeJson(AUTH_FILE, auth, { mode: 0o600 });
}

export function clearStoredAuth(): void {
  try {
    rmSync(AUTH_FILE, { force: true });
  } catch {
    /* best-effort */
  }
  clearProjectsCache();
}

/** Network timeout for Testomat.io API calls, so a hung request surfaces as a
 *  visible error instead of an infinite spinner. Generous because accounts with
 *  hundreds of projects can take 10s+ to serialize. Must stay below the Bun
 *  server's idleTimeout (see app-server.ts) so the handler can return a clean
 *  error before the client socket is reset. */
const FETCH_TIMEOUT_MS = 30_000;

// Short-lived server-side cache of the (slow) project list, keyed by token+host.
// The dialog status check, the connect call, and opening a project all need the
// same list within seconds of each other — without this each one re-downloads
// hundreds of projects (~10s every time). Kept brief so freshly-created or
// renamed projects still show up on the next interaction.
const PROJECTS_TTL_MS = 60_000;
const projectsCache = new Map<string, { at: number; projects: Project[] }>();

function projectsCacheKey(token: string, baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}::${token}`;
}

function saveProjectsToDisk(token: string, baseUrl: string, projects: Project[]): void {
  try {
    // mode 0o600: holds full projects incl. api_key, same trust as the JWT.
    writeJson(
      PROJECTS_CACHE_FILE,
      { key: projectsCacheKey(token, baseUrl), at: Date.now(), projects },
      { mode: 0o600 }
    );
  } catch {
    /* best-effort — cache is an optimization */
  }
}

function loadProjectsFromDisk(
  token: string,
  baseUrl: string
): { at: number; projects: Project[] } | null {
  try {
    const raw = readJson<{ key?: string; at?: number; projects?: Project[] }>(
      PROJECTS_CACHE_FILE,
      {}
    );
    if (raw.key !== projectsCacheKey(token, baseUrl)) return null;
    if (!Array.isArray(raw.projects) || raw.projects.length === 0) return null;
    return { at: typeof raw.at === "number" ? raw.at : 0, projects: raw.projects };
  } catch {
    return null;
  }
}

/**
 * Return cached projects without ever hitting the network: fresh in-memory
 * entry, else any disk cache (regardless of age). Returns null when nothing is
 * cached. Callers that want freshness should pair this with a background
 * `fetchProjects(token, baseUrl, { force: true })`.
 */
export function getCachedProjects(token: string, baseUrl: string): Project[] | null {
  const mem = projectsCache.get(projectsCacheKey(token, baseUrl));
  if (mem && Date.now() - mem.at < PROJECTS_TTL_MS) return mem.projects;
  const disk = loadProjectsFromDisk(token, baseUrl);
  if (disk) {
    // Warm the in-memory cache from disk so repeat calls this session are instant.
    projectsCache.set(projectsCacheKey(token, baseUrl), {
      at: disk.at,
      projects: disk.projects,
    });
    return disk.projects;
  }
  return null;
}

export interface FetchProjectsOptions {
  /** Bypass the cache and always hit the network. */
  force?: boolean;
}

export async function fetchProjects(
  token: string,
  baseUrl: string,
  opts: FetchProjectsOptions = {}
): Promise<Project[]> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/projects`;
  const cacheKey = projectsCacheKey(token, baseUrl);

  const cached = projectsCache.get(cacheKey);
  if (!opts.force && cached && Date.now() - cached.at < PROJECTS_TTL_MS) {
    console.log(
      `[tio-auth] using cached project list (${cached.projects.length}, age ${
        Date.now() - cached.at
      }ms)`
    );
    return cached.projects;
  }

  console.log(`[tio-auth] GET ${url} (token ${maskToken(token)})`);

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    const reason = timedOut
      ? `timed out after ${FETCH_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    console.error(`[tio-auth] GET ${url} failed: ${reason}`);
    const hint = timedOut
      ? ` Check that this machine can reach ${normalizeBaseUrl(baseUrl)} (VPN/DNS/firewall) and that TESTOMATIO_URL is correct.`
      : "";
    throw new Error(`Could not reach ${url} — ${reason}.${hint}`);
  }
  const ms = Date.now() - startedAt;
  console.log(`[tio-auth] → HTTP ${res.status} ${res.statusText} (${ms}ms)`);

  // Testomat.io returns 401 for missing tokens and 403 for rejected/expired
  // tokens — treat both as "re-authorize".
  if (res.status === 401 || res.status === 403) throw new UnauthorizedError();
  if (!res.ok) {
    throw new Error(`Failed to fetch projects: HTTP ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as {
    data?: Array<{ id?: string; attributes?: Record<string, unknown> }>;
  };
  const list = Array.isArray(body?.data) ? body.data : [];
  const projects: Project[] = [];
  let missingKey = 0;
  for (const entry of list) {
    const id = typeof entry?.id === "string" ? entry.id : null;
    const attrs = entry?.attributes ?? {};
    const title = typeof attrs.title === "string" ? attrs.title : id ?? "";
    // Testomat.io's JSON:API serializes attributes in kebab-case (`api-key`);
    // accept the snake_case form too for forward-compatibility.
    const rawKey = attrs["api-key"] ?? attrs.api_key;
    const apiKey = typeof rawKey === "string" ? rawKey : "";
    const framework = typeof attrs.framework === "string" ? attrs.framework : undefined;
    const rawCount = attrs["tests-count"] ?? attrs.tests_count;
    const testsCount = typeof rawCount === "number" ? rawCount : undefined;
    if (!id) continue;
    if (!apiKey) {
      missingKey++;
      continue;
    }
    projects.push({ id, title, apiKey, framework, testsCount });
  }
  console.log(
    `[tio-auth] parsed ${projects.length}/${list.length} project(s)` +
      (missingKey ? ` (${missingKey} skipped — no api-key in response)` : "") +
      `: ${projects.map((p) => p.id).join(", ") || "(none)"}`
  );
  projectsCache.set(cacheKey, { at: Date.now(), projects });
  saveProjectsToDisk(token, baseUrl, projects);
  return projects;
}

/** Drop the cached project list (e.g. on logout). */
export function clearProjectsCache(): void {
  projectsCache.clear();
  try {
    rmSync(PROJECTS_CACHE_FILE, { force: true });
  } catch {
    /* best-effort */
  }
}

/** Render a token as `eyJ…abcd` for safe logging — never log the full JWT. */
export function maskToken(token: string): string {
  if (!token) return "(empty)";
  if (token.length <= 12) return `${token.slice(0, 3)}…`;
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

// ── CLI (TUI) auth flow ──────────────────────────────────────────────────────
// Interactive JWT bootstrap + project picker for `bun src/cli.ts`. The web/app
// flow above drives login over HTTP; these read/write the terminal directly and
// reuse the same storage + fetchProjects so both surfaces stay in sync.

export async function promptForJwt(baseUrl: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    console.log("");
    console.log(chalk.bold("  Testomat.io authorization required"));
    console.log("");
    console.log(`  Open in your browser: ${chalk.cyan(`${baseUrl}/users/sign_in?auth=jwt`)}`);
    console.log("  Sign in, click Authorize, copy the token.");
    console.log("");

    while (true) {
      const answer = (await rl.question("  Paste the token here: ")).trim();
      if (!answer) {
        console.log(chalk.yellow("  Empty input. Try again."));
        continue;
      }
      if (!answer.startsWith("eyJ")) {
        console.log(chalk.yellow("  That doesn't look like a JWT (expected to start with 'eyJ'). Try again."));
        continue;
      }
      return answer;
    }
  } finally {
    rl.close();
  }
}

export async function pickProject(projects: Project[]): Promise<Project> {
  if (projects.length === 0) {
    throw new Error("No Testomat.io projects available for this account.");
  }
  if (projects.length === 1) {
    const only = projects[0]!;
    console.log(chalk.dim(`  Using the only available project: ${only.title} (${only.id})`));
    return only;
  }

  console.log("");
  console.log(chalk.bold("  Select a Testomat.io project:"));
  projects.forEach((p, idx) => {
    const fw = p.framework ? chalk.dim(` · ${p.framework}`) : "";
    console.log(`    ${chalk.cyan(String(idx + 1).padStart(2))}. ${p.title} ${chalk.dim(`(${p.id})`)}${fw}`);
  });
  console.log("");

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question(`  Enter number (1-${projects.length}): `)).trim();
      const n = Number.parseInt(answer, 10);
      if (Number.isInteger(n) && n >= 1 && n <= projects.length) {
        return projects[n - 1]!;
      }
      console.log(chalk.yellow(`  Please enter a number between 1 and ${projects.length}.`));
    }
  } finally {
    rl.close();
  }
}

export interface EnsureAuthOptions {
  baseUrl?: string;
  forceProjectPick?: boolean;
}

export interface EnsureAuthResult {
  token: string;
  baseUrl: string;
  project: Project;
  projects: Project[];
}

export async function ensureTestomatioAuth(opts: EnsureAuthOptions = {}): Promise<EnsureAuthResult> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  let stored = loadStoredAuth();

  if (!stored) {
    const token = await promptForJwt(baseUrl);
    stored = { token, baseUrl };
    saveStoredAuth(stored);
  } else if (stored.baseUrl !== baseUrl) {
    stored = { ...stored, baseUrl };
    saveStoredAuth(stored);
  }

  let projects: Project[];
  try {
    projects = await fetchProjects(stored.token, baseUrl);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      console.log(chalk.yellow("  Stored token was rejected. Re-authorizing…"));
      const token = await promptForJwt(baseUrl);
      stored = { token, baseUrl };
      saveStoredAuth(stored);
      projects = await fetchProjects(stored.token, baseUrl);
    } else {
      throw err;
    }
  }

  if (projects.length === 0) {
    throw new Error("No Testomat.io projects available for this account. Create one at the Testomat.io app, then re-run testeiya.");
  }

  let project: Project | undefined;
  if (!opts.forceProjectPick && stored.projectId) {
    project = projects.find((p) => p.id === stored!.projectId);
  }
  if (!project) {
    project = await pickProject(projects);
  }

  if (stored.projectId !== project.id) {
    stored = { ...stored, projectId: project.id };
    saveStoredAuth(stored);
  }

  return { token: stored.token, baseUrl, project, projects };
}
