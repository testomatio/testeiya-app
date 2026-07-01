// POST /api/files/rename  { session, path, anchor?, newName }
//
//   anchor present        → rewrite the test's heading and PUT its new title (@T)
//   path is a file/folder → rename the entry on disk (filenames have no remote
//                           counterpart, so these are local-only)
//
// A test rename syncs to Testomat.io when the test has an id and a project is
// linked; the remote PUT runs first and must succeed, else nothing changes.

import fs from "node:fs";
import path from "node:path";
import { getSession } from "../session-store.js";
import { safeResolve } from "../workspace/safe-path.js";
import { findTestBlock, blockTestId, blockHeadingLine } from "../workspace/test-md.js";
import { resolveProjectTarget, updateTestomatioResource } from "./testomatio-target.js";

export async function filesRename(request: Request): Promise<Response> {
  let body: { session?: string; path?: string; anchor?: string; newName?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const sessionId = body.session;
  const relPath = body.path;
  const newName = body.newName?.trim();
  if (!sessionId || !relPath || !newName) {
    return Response.json({ error: "session, path and newName required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const cwd = path.resolve(session.cwd);
  const abs = safeResolve(cwd, relPath);
  if (!abs) return Response.json({ error: "path outside workspace" }, { status: 400 });
  if (abs === cwd) {
    return Response.json({ error: "cannot rename the workspace root" }, { status: 400 });
  }
  if (!fs.existsSync(abs)) {
    return Response.json({ error: "path not found" }, { status: 404 });
  }

  if (body.anchor) return renameTest(session, cwd, abs, relPath, body.anchor, newName);
  return renameEntry(cwd, abs, relPath, newName);
}

async function renameTest(
  session: Parameters<typeof resolveProjectTarget>[0],
  cwd: string,
  abs: string,
  relPath: string,
  anchor: string,
  newTitle: string
): Promise<Response> {
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  const block = findTestBlock(lines, anchor);
  if (!block) {
    return Response.json({ error: `test "${anchor}" not found in file` }, { status: 404 });
  }
  const headingLine = blockHeadingLine(lines, block);
  if (headingLine < 0) {
    return Response.json({ error: "test heading not found" }, { status: 404 });
  }

  const id = blockTestId(lines, block);
  if (id) {
    const target = await resolveProjectTarget(session, cwd);
    if (target) {
      const ok = await updateTestomatioResource(target, "tests", id, { title: newTitle });
      if (!ok) {
        return Response.json(
          { error: `Failed to rename test ${id} on Testomat.io` },
          { status: 502 }
        );
      }
    }
  }

  const prefix = /^(#{1,2}\s+)/.exec(lines[headingLine])?.[1] ?? "# ";
  lines[headingLine] = `${prefix}${newTitle}`;
  fs.writeFileSync(abs, lines.join("\n"), "utf8");
  return Response.json({ ok: true, path: relPath, title: newTitle });
}

function renameEntry(cwd: string, abs: string, relPath: string, newName: string): Response {
  if (newName.includes("/") || newName.includes("\\") || newName === "." || newName === "..") {
    return Response.json({ error: "name can't contain slashes" }, { status: 400 });
  }
  const slash = relPath.lastIndexOf("/");
  const newRel = slash >= 0 ? `${relPath.slice(0, slash + 1)}${newName}` : newName;
  const newAbs = safeResolve(cwd, newRel);
  if (!newAbs) return Response.json({ error: "path outside workspace" }, { status: 400 });
  if (fs.existsSync(newAbs)) {
    return Response.json({ error: `"${newName}" already exists` }, { status: 409 });
  }
  fs.renameSync(abs, newAbs);
  return Response.json({ ok: true, path: newRel });
}
