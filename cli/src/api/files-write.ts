import fs from "node:fs";
import path from "node:path";
import { getSession } from "../session-store.js";
import { safeResolve } from "../workspace/safe-path.js";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function filesWrite(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  const relPath = url.searchParams.get("path");
  if (!sessionId || !relPath) {
    return Response.json({ error: "session and path required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const content = body.content;
  if (typeof content !== "string") {
    return Response.json({ error: "content must be a string" }, { status: 400 });
  }
  if (content.length > MAX_BYTES) {
    return Response.json({ error: "content too large" }, { status: 413 });
  }

  const abs = safeResolve(session.cwd, relPath);
  if (!abs) {
    return Response.json({ error: "path outside workspace" }, { status: 400 });
  }

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  const stat = fs.statSync(abs);
  return Response.json({ ok: true, path: relPath, size: stat.size, mtime: stat.mtimeMs });
}
