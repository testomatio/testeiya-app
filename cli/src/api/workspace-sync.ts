// POST /api/workspace/sync  { session, action: "pull" | "push", files?, suiteIds?, auto? }
//
// Runs `check-tests` for the session's workspace. Resolves the manual-tests
// dir and the project write-token, preferring the connected Testomat.io account
// and falling back to the folder's own `.env` (the check-tests convention).
//
//   pull              → fetch all suites (with `--export-automated`, unless the
//                       workspace is itself an automated-tests repo)
//   pull + suiteIds   → fetch only those suites (`--suite-ids`)
//   push              → partial push of only the changed files (full dir when
//                       nothing is detected as changed)
//   push + files      → push only those suites
//   push + auto       → background push-on-save: only suites that already exist
//                       on Testomat.io (carry an `@S` id) — local-only drafts are
//                       skipped until pushed explicitly.

import fs from "node:fs";
import path from "node:path";
import { getSession } from "../session-store.js";
import {
  runCheckTests,
  type CheckTestsAction,
  type RunCheckTestsOptions,
} from "../check-tests.js";
import { resolveManualTestsDir, hasAutomationConfig } from "../workspace-model.js";
import { computeChangedFiles } from "../sync-snapshot.js";
import { PROJECT_DIR, MANUAL_TESTS_SUBDIR } from "../project-dir.js";
import { safeResolve } from "../workspace/safe-path.js";
import { suiteId } from "../workspace/test-md.js";
import { resolveProjectCreds } from "./testomatio-target.js";

export async function workspaceSync(request: Request): Promise<Response> {
  let body: {
    session?: string;
    action?: string;
    files?: string[];
    suiteIds?: string[];
    auto?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "pull" && action !== "push") {
    return Response.json({ error: "action must be 'pull' or 'push'" }, { status: 400 });
  }
  const session = getSession(body.session ?? "");
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  const cwd = path.resolve(session.cwd);
  if (!fs.existsSync(cwd)) {
    return Response.json({ error: "Workspace missing" }, { status: 410 });
  }

  const dir = syncDir(cwd, action);
  if (dir === null) {
    if (action === "push" && body.auto) return Response.json({ ok: true, skipped: true });
    return Response.json(
      { error: "No manual tests in this workspace to push." },
      { status: 400 }
    );
  }

  const creds = await resolveProjectCreds(session, cwd);
  if (!creds) {
    if (action === "push" && body.auto) return Response.json({ ok: true, skipped: true });
    return Response.json(
      {
        error:
          "Can't sync: no Testomat.io project is linked to this workspace. Connect a project, or add a TESTOMATIO token to the folder's .env.",
      },
      { status: 400 }
    );
  }

  const run: RunCheckTestsOptions = {
    cwd,
    dir,
    token: creds.token,
    baseUrl: creds.baseUrl,
  };
  let files = pickFiles(cwd, body.files);

  if (action === "pull") {
    if (!hasAutomationConfig(cwd)) run.exportAutomated = true;
    if (Array.isArray(body.suiteIds) && body.suiteIds.length) run.suiteIds = body.suiteIds;
  }

  // Bulk push: restrict to the changed files (partial push). When nothing is
  // detected as changed, fall through to a full-dir push so an opened folder can
  // still be pushed wholesale.
  if (action === "push" && !files && !body.auto) {
    const changed = Object.keys(computeChangedFiles(cwd));
    if (changed.length > 0) files = changed;
  }

  // Auto push-on-save: only suites that already live on Testomat.io.
  if (action === "push" && body.auto) {
    files = (files ?? []).filter((rel) => hasSuiteId(cwd, rel));
    if (files.length === 0) return Response.json({ ok: true, action, dir, skipped: true });
  }

  if (files?.length) run.files = files;

  const result = await runCheckTests(action as CheckTestsAction, run);
  if (!result.ok) {
    return Response.json(
      { error: `check-tests ${action} failed`, output: tail(result.output) },
      { status: 502 }
    );
  }
  return Response.json({ ok: true, action, dir, skipped: false, output: tail(result.output) });
}

/** Sync target dir relative to cwd; null when push has nothing to push. */
function syncDir(cwd: string, action: CheckTestsAction): string | null {
  const resolved = resolveManualTestsDir(cwd);
  if (resolved !== null) return resolved || ".";
  // Nothing loaded yet: a pull seeds the gitignored cache; a push has no source.
  if (action === "push") return null;
  return `${PROJECT_DIR}/${MANUAL_TESTS_SUBDIR}`;
}

/** Keep only the client-supplied paths that resolve safely inside the workspace. */
function pickFiles(cwd: string, files: string[] | undefined): string[] | undefined {
  if (!Array.isArray(files) || files.length === 0) return undefined;
  const out: string[] = [];
  for (const rel of files) {
    if (typeof rel === "string" && safeResolve(cwd, rel)) out.push(rel);
  }
  return out.length > 0 ? out : undefined;
}

/** Whether a `*.test.md` already carries a Testomat.io suite id (`@S…`). */
function hasSuiteId(cwd: string, rel: string): boolean {
  const abs = safeResolve(cwd, rel);
  if (!abs) return false;
  try {
    return !!suiteId(fs.readFileSync(abs, "utf8"));
  } catch {
    return false;
  }
}

function tail(output: string, lines = 12): string {
  return output.split("\n").slice(-lines).join("\n");
}
