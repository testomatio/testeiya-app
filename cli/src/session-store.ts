import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { HOME_DIR } from "./project-dir.js";

const SESSIONS_FILE = path.join(HOME_DIR, "sessions.json");
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface StoredSession {
  sessionId: string;
  cwd: string;
  promptContext: string;
  backendUrl?: string;
  tokens?: Record<string, string>;
  projects: {
    slug: string;
    title: string;
    status: "ok" | "error";
    fileCount?: number;
    error?: string;
  }[];
  createdAt: number;
}

// The server is single-process, so the parsed array lives in module memory and
// each exported mutation is one synchronous read→modify→write with no `await`
// between — that makes it an atomic critical section. If you ever add an `await`
// inside a mutation, reintroduce serialization (an in-process async mutex).
let cache: StoredSession[] | null = null;

function readAll(): StoredSession[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
  } catch {
    cache = [];
  }
  return cache!;
}

function writeAll(sessions: StoredSession[]): void {
  cache = sessions;
  const dir = path.dirname(SESSIONS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${SESSIONS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2));
  fs.renameSync(tmp, SESSIONS_FILE);
}

export function createSession(
  data: Omit<StoredSession, "createdAt">
): StoredSession {
  const session: StoredSession = { ...data, createdAt: Date.now() };
  const sessions = pruneExpired(readAll());
  sessions.push(session);
  writeAll(sessions);
  return session;
}

export function getSession(sessionId: string): StoredSession | null {
  const sessions = readAll();
  return sessions.find((s) => s.sessionId === sessionId) ?? null;
}

/** Most-recent live session rooted at `cwd`, if any (used to reuse a workspace). */
export function getSessionByCwd(cwd: string): StoredSession | null {
  cleanExpiredSessions();
  const sessions = readAll();
  const match = sessions.filter((s) => s.cwd === cwd);
  if (match.length === 0) return null;
  return match.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}

export function deleteSession(sessionId: string): void {
  const sessions = readAll();
  writeAll(sessions.filter((s) => s.sessionId !== sessionId));
}

export function cleanExpiredSessions(maxAgeMs = MAX_AGE_MS): void {
  const sessions = readAll();
  const alive = pruneExpired(sessions, maxAgeMs);
  if (alive.length !== sessions.length) writeAll(alive);
}

// Returns the still-alive sessions, deleting on disk ONLY Testeiya's own
// ephemeral temp workspaces. Persistent per-project dirs (~/.testeiya/workspaces)
// and folders the user opened are NOT ours to remove — wiping them on a 24h TTL
// would destroy data.
function pruneExpired(
  sessions: StoredSession[],
  maxAgeMs = MAX_AGE_MS
): StoredSession[] {
  const now = Date.now();
  const alive: StoredSession[] = [];
  const tmpRoot = os.tmpdir() + path.sep;
  for (const session of sessions) {
    if (now - session.createdAt <= maxAgeMs) {
      alive.push(session);
      continue;
    }
    if (session.cwd.startsWith(tmpRoot)) {
      try {
        fs.rmSync(session.cwd, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
  return alive;
}
