// POST /api/files/delete  { session, path, anchor? }
//
// Deletes a workspace node AND its Testomat.io counterpart. check-tests pull/push
// never propagate deletions, so the suite/test is removed via a direct v2 DELETE.
//
//   anchor present        → delete one test  (@T) and strip its block from the file
//   path is a `*.test.md` → delete the suite (@S) and unlink the file
//   path is a folder      → delete every contained suite, then remove the folder
//
// Remote-first and atomic: if a resource has an id but its DELETE fails (or no
// project is linked), nothing is removed on disk. Id-less nodes (created locally,
// never pushed) delete locally with no remote call.

import fs from "node:fs";
import path from "node:path";
import { getSession } from "../session-store.js";
import { safeResolve } from "../workspace/safe-path.js";
import { VENDOR_DIRS } from "../workspace-model.js";
import {
  TEST_MD_RE,
  findTestBlock,
  blockTestId,
  suiteId,
} from "../workspace/test-md.js";
import {
  resolveProjectTarget,
  deleteTestomatioResource,
  type ProjectTarget,
} from "./testomatio-target.js";

export async function filesDelete(request: Request): Promise<Response> {
  let body: { session?: string; path?: string; anchor?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const sessionId = body.session;
  const relPath = body.path;
  if (!sessionId || !relPath) {
    return Response.json({ error: "session and path required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const cwd = path.resolve(session.cwd);
  const abs = safeResolve(cwd, relPath);
  if (!abs) return Response.json({ error: "path outside workspace" }, { status: 400 });
  if (abs === cwd) {
    return Response.json({ error: "cannot delete the workspace root" }, { status: 400 });
  }
  if (!fs.existsSync(abs)) {
    return Response.json({ error: "path not found" }, { status: 404 });
  }

  if (body.anchor) return deleteTest(session, cwd, abs, relPath, body.anchor);
  if (fs.statSync(abs).isDirectory()) return deleteFolder(session, cwd, abs, relPath);
  return deleteFile(session, cwd, abs, relPath);
}

async function deleteTest(
  session: Parameters<typeof resolveProjectTarget>[0],
  cwd: string,
  abs: string,
  relPath: string,
  anchor: string
): Promise<Response> {
  const content = fs.readFileSync(abs, "utf8");
  const lines = content.split("\n");
  const block = findTestBlock(lines, anchor);
  if (!block) {
    return Response.json({ error: `test "${anchor}" not found in file` }, { status: 404 });
  }

  const id = blockTestId(lines, block);
  if (id) {
    const target = await resolveProjectTarget(session, cwd);
    if (!target) return Response.json({ error: noProjectMessage }, { status: 400 });
    const ok = await deleteTestomatioResource(target, "tests", id);
    if (!ok) {
      return Response.json({ error: `Failed to delete test ${id} on Testomat.io` }, { status: 502 });
    }
  }

  const next = [...lines.slice(0, block.start), ...lines.slice(block.end + 1)].join("\n");
  fs.writeFileSync(abs, next, "utf8");
  return Response.json({ ok: true, path: relPath, deletedTest: id });
}

async function deleteFile(
  session: Parameters<typeof resolveProjectTarget>[0],
  cwd: string,
  abs: string,
  relPath: string
): Promise<Response> {
  const id = suiteId(fs.readFileSync(abs, "utf8"));
  if (id) {
    const target = await resolveProjectTarget(session, cwd);
    if (!target) return Response.json({ error: noProjectMessage }, { status: 400 });
    const ok = await deleteTestomatioResource(target, "suites", id);
    if (!ok) {
      return Response.json({ error: `Failed to delete suite ${id} on Testomat.io` }, { status: 502 });
    }
  }
  fs.unlinkSync(abs);
  return Response.json({ ok: true, path: relPath, deletedSuite: id });
}

async function deleteFolder(
  session: Parameters<typeof resolveProjectTarget>[0],
  cwd: string,
  abs: string,
  relPath: string
): Promise<Response> {
  const suiteIds: string[] = [];
  for (const file of collectTestFiles(abs)) {
    const id = suiteId(fs.readFileSync(file, "utf8"));
    if (id) suiteIds.push(id);
  }

  let target: ProjectTarget | null = null;
  if (suiteIds.length > 0) {
    target = await resolveProjectTarget(session, cwd);
    if (!target) return Response.json({ error: noProjectMessage }, { status: 400 });
  }

  const failed: string[] = [];
  if (target) {
    for (const id of suiteIds) {
      const ok = await deleteTestomatioResource(target, "suites", id);
      if (!ok) failed.push(id);
    }
  }
  if (failed.length > 0) {
    return Response.json(
      {
        error: `Failed to delete ${failed.length} suite(s) on Testomat.io (${failed.join(", ")}); folder kept. Some suites may already be deleted.`,
      },
      { status: 502 }
    );
  }

  fs.rmSync(abs, { recursive: true, force: true });
  return Response.json({ ok: true, path: relPath, deletedSuites: suiteIds });
}

function collectTestFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (VENDOR_DIRS.has(entry.name)) continue;
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTestFiles(child));
      continue;
    }
    if (entry.isFile() && TEST_MD_RE.test(entry.name)) out.push(child);
  }
  return out;
}

const noProjectMessage =
  "Can't delete on Testomat.io: no project is linked to this workspace. Connect a project, or remove the test ids and try again.";
