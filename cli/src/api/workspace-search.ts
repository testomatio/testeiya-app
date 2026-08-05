import path from "node:path";
import { grep, GrepOutputMode, type ContextLine, type GrepMatch } from "@oh-my-pi/pi-natives";
import { getSession } from "../session-store.js";
import { safeResolve } from "../workspace/safe-path.js";
import { resolveManualTestsDir, VENDOR_DIRS } from "../workspace-model.js";

const MAX_MATCHES = 200;
const CONTEXT_LINES = 2;

export async function workspaceSearch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  const q = url.searchParams.get("q");
  const scope = url.searchParams.get("scope") === "all" ? "all" : "manual";
  if (!sessionId || !q?.trim()) {
    return Response.json({ error: "session and q required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const cwd = session.cwd;
  let searchRel = "";
  if (scope === "manual") searchRel = resolveManualTestsDir(cwd) ?? "";
  const abs = safeResolve(cwd, searchRel || ".");
  if (!abs) return Response.json({ error: "path outside workspace" }, { status: 400 });

  // The manual-tests dir is an intentionally-gitignored cache, so manual scope
  // must not honor .gitignore (else it could match nothing); all scope respects
  // the user's repo ignores to skip build artifacts and dependencies.
  let result: { matches: GrepMatch[]; limitReached?: boolean };
  try {
    result = await grep({
      pattern: escapeRegex(q.trim()),
      path: abs,
      ignoreCase: true,
      gitignore: scope === "all",
      hidden: false,
      contextBefore: CONTEXT_LINES,
      contextAfter: CONTEXT_LINES,
      maxCount: MAX_MATCHES,
      mode: GrepOutputMode.Content,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("regex parse error")) {
      return Response.json({ error: message }, { status: 400 });
    }
    throw err;
  }

  const fileOrder: string[] = [];
  const byFile = new Map<string, SearchMatch[]>();
  let totalMatches = 0;
  for (const match of result.matches) {
    const rel = toCwdRelative(cwd, abs, match.path);
    if (rel.split("/").some((segment) => VENDOR_DIRS.has(segment))) continue;
    if (!byFile.has(rel)) {
      fileOrder.push(rel);
      byFile.set(rel, []);
    }
    byFile.get(rel)!.push({
      lineNumber: match.lineNumber,
      line: match.line,
      before: match.contextBefore ?? [],
      after: match.contextAfter ?? [],
    });
    totalMatches++;
  }

  const files = fileOrder.map((p) => ({ path: p, matches: byFile.get(p)! }));
  return Response.json({
    query: q.trim(),
    scope,
    scopePath: searchRel,
    totalMatches,
    totalFiles: files.length,
    truncated: Boolean(result.limitReached),
    files,
  });
}

function toCwdRelative(cwd: string, searchRoot: string, matchPath: string): string {
  const absMatch = path.resolve(searchRoot, matchPath);
  return path.relative(cwd, absMatch).split(path.sep).join("/");
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface SearchMatch {
  lineNumber: number;
  line: string;
  before: ContextLine[];
  after: ContextLine[];
}
