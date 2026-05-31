// Client helpers for the Testomat.io login flow. All same-origin against the
// Bun app-server's `/api/auth/testomatio*` routes (see
// testclaw/src/api/testomatio-auth.ts). The JWT itself never round-trips back
// to the client — we only ever learn connection status + project metadata.

export interface TestomatioProject {
  id: string;
  title: string;
  framework?: string;
  testsCount?: number;
}

export interface TestomatioAuthState {
  connected: boolean;
  baseUrl: string;
  signInUrl: string;
  /** True when a previously stored token was rejected by the server. */
  rejected?: boolean;
  selectedProjectId?: string;
  projects?: TestomatioProject[];
}

export interface CreatedSession {
  sessionId: string;
  cwd: string;
  backendUrl: string;
  project: { id: string; title: string };
}

export const DEFAULT_BASE_URL = "https://app.testomat.io";

/** Normalize a (possibly schemeless) base URL the same way the server does. */
export function normalizeBaseUrl(raw: string): string {
  let url = (raw || "").trim();
  if (!url) return DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

/** Browser URL the user opens to mint an app JWT, derived from the base URL. */
export function buildSignInUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/app-auth`;
}

/**
 * Open `url` in the user's real browser. In the Electrobun desktop webview a
 * plain anchor does nothing, so we ask the server (native `openExternal`); in a
 * plain browser the server reports `opened: false` and we use `window.open`.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    const res = await fetch("/api/open-external", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => null);
    if (data?.opened) return;
  } catch {
    /* fall through to the browser path */
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

async function asError(res: Response): Promise<never> {
  let message = `Request failed (HTTP ${res.status})`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* keep the generic message */
  }
  throw new Error(message);
}

// Loading the project list can take 10s+ on large accounts, so we cache the
// last successful (connected) state in localStorage. The cached payload is the
// public, token-free view (project id/title/framework + selection) — no
// secrets — so it's safe to persist. The dialog seeds from this instantly and
// revalidates in the background (stale-while-revalidate).
const CACHE_KEY = "testclaw.testomatio.authState.v1";

export function readCachedAuthState(): TestomatioAuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TestomatioAuthState;
    if (!parsed?.connected || !Array.isArray(parsed.projects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedAuthState(state: TestomatioAuthState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (state?.connected && state.projects && state.projects.length > 0) {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    } else {
      // Not connected / no projects → drop any stale cache.
      window.localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    /* ignore quota / disabled storage */
  }
}

// Status checks can take 10s+ on large accounts. Multiple components may ask at
// once (React effects, dialog open) — collapse concurrent requests into one
// shared in-flight promise so we never fire duplicate slow calls.
let inFlightStatus: Promise<TestomatioAuthState> | null = null;

export function getAuthState(): Promise<TestomatioAuthState> {
  if (inFlightStatus) return inFlightStatus;
  inFlightStatus = (async () => {
    const res = await fetch("/api/auth/testomatio", { credentials: "same-origin" });
    if (!res.ok) return asError(res);
    const state = (await res.json()) as TestomatioAuthState;
    writeCachedAuthState(state);
    return state;
  })();
  inFlightStatus.finally(() => {
    inFlightStatus = null;
  });
  return inFlightStatus;
}

/** Connect with a pasted JWT. Returns the now-connected state + project list. */
export async function connectTestomatio(
  token: string,
  baseUrl?: string
): Promise<TestomatioAuthState> {
  const res = await fetch("/api/auth/testomatio", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, baseUrl }),
  });
  if (!res.ok) return asError(res);
  const state = (await res.json()) as TestomatioAuthState;
  writeCachedAuthState(state);
  return state;
}

export async function logoutTestomatio(): Promise<void> {
  writeCachedAuthState(null);
  await fetch("/api/auth/testomatio", {
    method: "DELETE",
    credentials: "same-origin",
  });
}

/** Create an agent session for the chosen project; resolves to its sessionId. */
export async function createProjectSession(
  projectId: string
): Promise<CreatedSession> {
  const res = await fetch("/api/auth/testomatio/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) return asError(res);
  return res.json();
}
