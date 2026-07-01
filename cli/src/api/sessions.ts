import fs from "node:fs";
import { SessionManager } from "@oh-my-pi/pi-coding-agent";
import { getSession } from "../session-store.js";
import { HOME_DIR } from "../project-dir.js";
import { historyToChatMessages, stripInjectedContext } from "../bridge.js";

export async function sessionsList(request: Request): Promise<Response> {
  const resolved = resolve(request);
  if (resolved instanceof Response) return resolved;
  const { cwd, dir } = resolved;
  const infos = await SessionManager.list(cwd, dir);
  const conversations = infos
    .map((i) => ({
      id: i.id,
      title: i.title ? stripInjectedContext(i.title) : null,
      firstMessage: stripInjectedContext(i.firstMessage),
      messageCount: i.messageCount,
      created: i.created,
      modified: i.modified,
    }))
    .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  return Response.json({ conversations });
}

export async function sessionMessages(
  conversationId: string,
  request: Request,
): Promise<Response> {
  const resolved = resolve(request);
  if (resolved instanceof Response) return resolved;
  const { cwd, dir } = resolved;
  const infos = await SessionManager.list(cwd, dir);
  const info = infos.find((i) => i.id === conversationId);
  if (!info) return Response.json({ error: "Conversation not found" }, { status: 404 });
  const manager = await SessionManager.open(info.path, dir);
  const messages = historyToChatMessages(manager.buildSessionContext().messages);
  return Response.json({ messages });
}

export async function sessionRename(
  conversationId: string,
  request: Request,
): Promise<Response> {
  const resolved = resolve(request);
  if (resolved instanceof Response) return resolved;
  const { cwd, dir } = resolved;
  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const title = body.title?.trim();
  if (!title) return Response.json({ error: "title required" }, { status: 400 });
  const infos = await SessionManager.list(cwd, dir);
  const info = infos.find((i) => i.id === conversationId);
  if (!info) return Response.json({ error: "Conversation not found" }, { status: 404 });
  const manager = await SessionManager.open(info.path, dir);
  await manager.setSessionName(title);
  return Response.json({ ok: true, title });
}

export async function sessionDelete(
  conversationId: string,
  request: Request,
): Promise<Response> {
  const resolved = resolve(request);
  if (resolved instanceof Response) return resolved;
  const { cwd, dir } = resolved;
  const infos = await SessionManager.list(cwd, dir);
  const info = infos.find((i) => i.id === conversationId);
  if (!info) return Response.json({ error: "Conversation not found" }, { status: 404 });
  fs.rmSync(info.path, { force: true });
  return Response.json({ ok: true });
}

function resolve(request: Request): { cwd: string; dir: string } | Response {
  const sessionId = new URL(request.url).searchParams.get("session");
  if (!sessionId) return Response.json({ error: "session required" }, { status: 400 });
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  const dir = SessionManager.getDefaultSessionDir(session.cwd, HOME_DIR);
  return { cwd: session.cwd, dir };
}
