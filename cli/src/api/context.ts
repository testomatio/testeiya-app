// User-added agent context (see context-store.ts):
//   GET  /api/context?session=       → list entries
//   POST /api/context                { session, kind: "folder", path } | { session, kind: "repo", url }
//   POST /api/context/upload         multipart form-data: session + files
//   POST /api/context/remove         { session, id }
//
// Folders are symlinked and repos shallow-cloned directly into `.testeiya/`,
// keeping the source's basename (an `extra-` prefix on collision) so a search
// hit identifies which source it came from; uploaded documents land in
// `.testeiya/requirements/`. Symlinked dirs are not traversed by wildcard
// searches (the walker doesn't follow links) — the system prompt teaches the
// agent to search a linked entry via its explicit path prefix, and the file
// tree resolves them explicitly.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getSession, type StoredSession } from "../session-store.js";
import {
  PROJECT_DIR,
  CONTEXT_REQUIREMENTS_SUBDIR,
  CUSTOM_SKILLS_SUBDIR,
} from "../project-dir.js";
import {
  CONTEXT_SECTION_DIRS,
  listContext,
  listContextFolders,
  loadContextEntries,
  saveContextEntries,
  type ContextEntry,
} from "../context-store.js";

const CLONE_TIMEOUT_MS = 180_000;
const GIT_URL_RE = /^(https?:\/\/|git@|ssh:\/\/)\S+$/;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const RESERVED_DIR_NAMES = new Set([...CONTEXT_SECTION_DIRS, CUSTOM_SKILLS_SUBDIR]);

export async function contextList(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const resolved = resolveSession(url.searchParams.get("session"));
  if (resolved instanceof Response) return resolved;
  return Response.json({
    entries: listContext(resolved.cwd),
    folders: listContextFolders(resolved.cwd),
  });
}

export async function contextAdd(request: Request): Promise<Response> {
  let body: { session?: string; kind?: string; path?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const resolved = resolveSession(body.session);
  if (resolved instanceof Response) return resolved;
  const { cwd } = resolved;

  if (body.kind === "folder") return addFolder(cwd, body.path);
  if (body.kind === "repo") return addRepo(cwd, body.url);
  return Response.json({ error: "kind must be 'folder' or 'repo'" }, { status: 400 });
}

export async function contextUpload(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "multipart form-data expected" }, { status: 400 });
  }
  const resolved = resolveSession(String(form.get("session") ?? ""));
  if (resolved instanceof Response) return resolved;
  const { cwd } = resolved;

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "no files uploaded" }, { status: 400 });
  }

  const destDir = path.join(cwd, PROJECT_DIR, CONTEXT_REQUIREMENTS_SUBDIR);
  fs.mkdirSync(destDir, { recursive: true });
  const entries = loadContextEntries(cwd);
  const added: ContextEntry[] = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `${file.name} is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024}MB` },
        { status: 413 }
      );
    }
    const name = uniqueName(destDir, sanitizeName(file.name));
    fs.writeFileSync(path.join(destDir, name), Buffer.from(await file.arrayBuffer()));
    added.push(makeEntry("file", name, `${PROJECT_DIR}/${CONTEXT_REQUIREMENTS_SUBDIR}/${name}`, file.name));
  }
  entries.push(...added);
  saveContextEntries(cwd, entries);
  return Response.json({ added, entries: listContext(cwd), folders: listContextFolders(cwd) });
}

export async function contextRemove(request: Request): Promise<Response> {
  let body: { session?: string; id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const resolved = resolveSession(body.session);
  if (resolved instanceof Response) return resolved;
  const { cwd } = resolved;

  const entry = listContext(cwd).find((e) => e.id === body.id);
  if (!entry) {
    return Response.json({ error: "Context entry not found" }, { status: 404 });
  }

  const abs = path.resolve(cwd, entry.path);
  const configRoot = path.join(path.resolve(cwd), PROJECT_DIR) + path.sep;
  if (abs.startsWith(configRoot)) removePath(abs);

  const remaining = loadContextEntries(cwd).filter((e) => e.path !== entry.path);
  saveContextEntries(cwd, remaining);
  return Response.json({ entries: listContext(cwd), folders: listContextFolders(cwd) });
}

async function addFolder(cwd: string, rawPath: string | undefined): Promise<Response> {
  const raw = rawPath?.trim();
  if (!raw) return Response.json({ error: "path is required" }, { status: 400 });

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
  const workspaceRoot = path.resolve(cwd);
  if (abs === workspaceRoot || abs.startsWith(workspaceRoot + path.sep)) {
    return Response.json(
      { error: "That folder is already inside the workspace." },
      { status: 400 }
    );
  }

  const entries = loadContextEntries(cwd);
  const existing = entries.find((e) => e.origin === abs);
  if (existing) {
    return Response.json({
      added: [existing],
      entries: listContext(cwd),
      folders: listContextFolders(cwd),
    });
  }

  const destDir = path.join(cwd, PROJECT_DIR);
  fs.mkdirSync(destDir, { recursive: true });
  const name = uniqueDirName(destDir, sanitizeName(path.basename(abs)));
  const linkType = process.platform === "win32" ? "junction" : "dir";
  try {
    fs.symlinkSync(abs, path.join(destDir, name), linkType);
  } catch (e) {
    return Response.json(
      { error: `Failed to link folder: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }

  const entry = makeEntry("folder", name, `${PROJECT_DIR}/${name}`, abs);
  entries.push(entry);
  saveContextEntries(cwd, entries);
  return Response.json({ added: [entry], entries: listContext(cwd), folders: listContextFolders(cwd) });
}

async function addRepo(cwd: string, rawUrl: string | undefined): Promise<Response> {
  const url = rawUrl?.trim();
  if (!url) return Response.json({ error: "url is required" }, { status: 400 });
  if (!GIT_URL_RE.test(url)) {
    return Response.json(
      { error: "Not a git URL. Use https://, ssh:// or git@ form." },
      { status: 400 }
    );
  }

  const entries = loadContextEntries(cwd);
  const existing = entries.find((e) => e.origin === url);
  if (existing) {
    return Response.json({
      added: [existing],
      entries: listContext(cwd),
      folders: listContextFolders(cwd),
    });
  }

  const destDir = path.join(cwd, PROJECT_DIR);
  fs.mkdirSync(destDir, { recursive: true });
  const name = uniqueDirName(destDir, repoName(url));
  const target = path.join(destDir, name);

  const clone = await runGitClone(url, target);
  if (!clone.ok) {
    fs.rmSync(target, { recursive: true, force: true });
    return Response.json(
      { error: `git clone failed: ${tail(clone.output)}` },
      { status: 502 }
    );
  }

  const entry = makeEntry("repo", name, `${PROJECT_DIR}/${name}`, url);
  entries.push(entry);
  saveContextEntries(cwd, entries);
  return Response.json({ added: [entry], entries: listContext(cwd), folders: listContextFolders(cwd) });
}

function runGitClone(url: string, target: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "git",
      ["clone", "--depth", "1", "--single-branch", url, target],
      { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }
    );
    let output = "";
    const timer = setTimeout(() => {
      output += "\n(timed out)";
      child.kill("SIGKILL");
    }, CLONE_TIMEOUT_MS);
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, output: `${output}\n${e.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output });
    });
  });
}

function resolveSession(sessionId: string | null | undefined): Response | StoredSession {
  if (!sessionId) {
    return Response.json({ error: "session is required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  if (!fs.existsSync(session.cwd)) {
    return Response.json({ error: "Workspace missing" }, { status: 410 });
  }
  return session;
}

function makeEntry(
  kind: ContextEntry["kind"],
  name: string,
  relPath: string,
  origin: string
): ContextEntry {
  return {
    id: randomUUID().slice(0, 8),
    kind,
    name,
    path: relPath,
    origin,
    addedAt: new Date().toISOString(),
  };
}

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function sanitizeName(name: string): string {
  const clean = name.replace(/[/\\:*?"<>|]/g, "_").replace(/^\.+/, "").trim();
  return clean || "context";
}

function repoName(url: string): string {
  const last = url.replace(/\/+$/, "").split(/[/:]/).pop() ?? "repo";
  return sanitizeName(last.replace(/\.git$/i, ""));
}

// Context dirs keep the source's basename; a taken or reserved name gets an
// `extra-` prefix (then the numeric fallback) so search hits stay
// identifiable and a link can never shadow a predefined `.testeiya` dir.
function uniqueDirName(dir: string, name: string): string {
  if (!RESERVED_DIR_NAMES.has(name) && !lexists(path.join(dir, name))) return name;
  return uniqueName(dir, `extra-${name}`);
}

function uniqueName(dir: string, name: string): string {
  if (!lexists(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}${ext}`;
    if (!lexists(path.join(dir, candidate))) return candidate;
  }
}

function lexists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function removePath(abs: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(abs);
  } catch {
    return;
  }
  if (stat.isSymbolicLink() || stat.isFile()) {
    fs.rmSync(abs, { force: true });
    return;
  }
  fs.rmSync(abs, { recursive: true, force: true });
}

function tail(output: string, lines = 6): string {
  return output.trim().split("\n").slice(-lines).join("\n");
}
