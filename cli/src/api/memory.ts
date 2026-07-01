import fs from "node:fs";
import path from "node:path";
import {
  getMemoryRoot,
  clearMemoryData,
  enqueueMemoryConsolidation,
} from "@oh-my-pi/pi-coding-agent/memories";
import { getSession } from "../session-store.js";
import { HOME_DIR } from "../project-dir.js";
import { loadConfig, saveMemoryEnabled } from "../config.js";

export async function memoryGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const enabled = loadConfig().memoryEnabled;
  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    return Response.json({ enabled, content: null, summary: null, exists: false });
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const root = getMemoryRoot(HOME_DIR, session.cwd);
  const content = readIfExists(path.join(root, "MEMORY.md"));
  const summary = readIfExists(path.join(root, "memory_summary.md"));
  return Response.json({
    enabled,
    content,
    summary,
    exists: Boolean(content) || Boolean(summary),
    root,
  });
}

export async function memoryPost(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { action?: string };

  // Enable/disable is a global preference — no session/workspace needed.
  if (body.action === "enable" || body.action === "disable") {
    const enabled = body.action === "enable";
    saveMemoryEnabled(enabled);
    return Response.json({ ok: true, enabled });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    return Response.json({ error: "session required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  if (body.action === "rebuild") {
    enqueueMemoryConsolidation(HOME_DIR, session.cwd);
    return Response.json({ ok: true });
  }
  if (body.action === "clear") {
    await clearMemoryData(HOME_DIR, session.cwd);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}

function readIfExists(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
