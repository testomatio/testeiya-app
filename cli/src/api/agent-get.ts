import { getSession } from "../session-store.js";

export async function agentGet(sessionId: string): Promise<Response> {
  const session = getSession(sessionId);

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const expectedMcpServers = (session.projects ?? [])
    .filter((p) => p.status === "ok")
    .map((p) => `testomatio-${p.slug}`);

  return Response.json({
    sessionId: session.sessionId,
    cwd: session.cwd,
    projects: session.projects,
    backendUrl: session.backendUrl,
    expectedMcpServers,
    createdAt: session.createdAt,
  });
}
