import fs from "node:fs";
import { getSession } from "../session-store.js";
import { safeResolveThroughLinks } from "../workspace/safe-path.js";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function filesRead(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  const relPath = url.searchParams.get("path");
  if (!sessionId || !relPath) {
    return Response.json({ error: "session and path required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const abs = safeResolveThroughLinks(session.cwd, relPath);
  if (!abs) {
    return Response.json({ error: "path outside workspace" }, { status: 400 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return Response.json({ error: "file not found" }, { status: 404 });
  }
  if (!stat.isFile()) {
    return Response.json({ error: "not a file" }, { status: 400 });
  }
  if (stat.size > MAX_BYTES) {
    return Response.json({ error: "file too large" }, { status: 413 });
  }
  const content = fs.readFileSync(abs, "utf8");
  return Response.json({
    content,
    path: relPath,
    size: stat.size,
    mtime: stat.mtimeMs,
  });
}
