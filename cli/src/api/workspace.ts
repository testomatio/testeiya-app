import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createSession, getSessionByCwd, getSession } from "../session-store.js";

/**
 * Workspace switching — start an agent session rooted at an arbitrary local
 * directory the user opens, instead of the Testomat.io-pulled temp workspace.
 */

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function isLocalRuntime(): boolean {
  if (process.env.TESTEIYA_RUNTIME === "desktop") return true;
  const host = process.env.HOST || "127.0.0.1";
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function revealCommand(): string {
  if (process.platform === "darwin") return "open";
  if (process.platform === "win32") return "explorer";
  return "xdg-open";
}

export async function workspaceOpen(req: Request): Promise<Response> {
  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const raw = body.path?.trim();
  if (!raw) {
    return Response.json({ error: "path is required" }, { status: 400 });
  }

  const abs = path.resolve(expandHome(raw));
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return Response.json({ error: `No such directory: ${abs}` }, { status: 404 });
  }
  if (!stat.isDirectory()) {
    return Response.json({ error: `Not a directory: ${abs}` }, { status: 400 });
  }

  const sessionId = randomUUID();
  createSession({
    sessionId,
    cwd: abs,
    promptContext: `The workspace is a local directory: ${abs}. Explore it with read/find/grep/ls to understand the project, and edit files there when asked.`,
    projects: [],
    trusted: true,
  });

  return Response.json({ sessionId, cwd: abs });
}

/**
 * Web-mode default workspace. In a browser there is no native picker, so the
 * deploy supplies the working directory via the `TESTEIYA_WORKSPACE` env var;
 * the UI opens it automatically on a cold load. Reuses a still-live session for
 * the same dir so a refresh doesn't spawn duplicates. Returns
 * `{ sessionId: null }` when the env var is unset or the path isn't a dir.
 */
export async function workspaceDefault(): Promise<Response> {
  const raw = process.env.TESTEIYA_WORKSPACE?.trim();
  if (!raw) return Response.json({ sessionId: null });

  const abs = path.resolve(expandHome(raw));
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    console.warn(`[workspace] TESTEIYA_WORKSPACE not found: ${abs}`);
    return Response.json({ sessionId: null });
  }
  if (!stat.isDirectory()) {
    console.warn(`[workspace] TESTEIYA_WORKSPACE is not a directory: ${abs}`);
    return Response.json({ sessionId: null });
  }

  const existing = getSessionByCwd(abs);
  if (existing) return Response.json({ sessionId: existing.sessionId, cwd: abs });

  const sessionId = randomUUID();
  createSession({
    sessionId,
    cwd: abs,
    promptContext: `The workspace is a local directory: ${abs}. Explore it with read/find/grep/ls to understand the project, and edit files there when asked.`,
    projects: [],
    trusted: true,
  });
  return Response.json({ sessionId, cwd: abs });
}

/**
 * Native folder picker — only available when running inside Electrobun (the Bun
 * main process). In standalone/browser mode this returns { available: false }
 * and the client falls back to a manual path field.
 */
export async function workspacePick(): Promise<Response> {
  try {
    const { Utils } = await import("electrobun/bun");
    const selection = await Utils.openFileDialog({
      startingFolder: "~/",
      canChooseFiles: false,
      canChooseDirectory: true,
      allowsMultipleSelection: false,
    });
    const picked = Array.isArray(selection) ? selection[0] : undefined;
    return Response.json({ available: true, path: picked ?? null });
  } catch {
    // electrobun not present (running via `bun serve:app` or a plain browser).
    return Response.json({ available: false, path: null });
  }
}

/**
 * Reveal the session's working directory in the OS file manager (Finder /
 * Explorer / the default Linux file manager). Only meaningful when the server
 * runs on the user's own machine — the desktop app or a loopback dev server; a
 * remote web deploy reports `{ revealed: false }` and the client surfaces a hint.
 */
export async function workspaceReveal(req: Request): Promise<Response> {
  let body: { session?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const sessionId = body.session?.trim();
  if (!sessionId) {
    return Response.json({ error: "session is required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  if (!isLocalRuntime()) {
    return Response.json({ revealed: false });
  }

  const dir = session.cwd;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(dir);
  } catch {
    return Response.json({ error: `No such directory: ${dir}` }, { status: 404 });
  }
  if (!stat.isDirectory()) {
    return Response.json({ error: `Not a directory: ${dir}` }, { status: 400 });
  }

  const child = spawn(revealCommand(), [dir], { detached: true, stdio: "ignore" });
  child.unref();
  return Response.json({ revealed: true });
}
