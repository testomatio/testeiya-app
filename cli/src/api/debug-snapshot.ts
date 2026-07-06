import { buildSnapshot } from "../debug-bus.js";
import { getSession } from "../session-store.js";

/*
 * `GET /api/debug/snapshot?session=<id>` — the agent's one-stop debug dump.
 * Merges everything the server holds (Testomat.io REST calls, LLM events, the
 * server console) with the latest browser report (client requests, agent WS
 * events, console, MobX store) and the session's server-side metadata. The
 * `testeiya-debug` skill reads this to reason across the whole stack.
 */

export function debugSnapshot(req: Request): Response {
  const sessionId = new URL(req.url).searchParams.get("session");
  const snapshot = buildSnapshot(sessionId);
  return Response.json({ ...snapshot, session: sessionMeta(sessionId) });
}

function sessionMeta(sessionId: string | null) {
  if (!sessionId) return null;
  const session = getSession(sessionId);
  if (!session) return { sessionId, found: false };
  return {
    sessionId,
    found: true,
    cwd: session.cwd,
    backendUrl: session.backendUrl,
    projects: session.projects,
    createdAt: session.createdAt,
  };
}
