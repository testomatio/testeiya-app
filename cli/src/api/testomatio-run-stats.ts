import { getSession } from "../session-store.js";
import { resolveTestomatioTarget } from "./testomatio-proxy.js";
import { loadStoredAuth } from "../testomatio-auth.js";
import { loggedServerFetch } from "../debug-bus.js";

/*
 * Pass/fail/skip counters for the run detail widget:
 *
 *   GET /api/testomatio/run-stats?session=<sid>&run_id=<id>
 *
 * The v2 Run schema carries no counters, so we read them from the app API
 * (`${baseUrl}/api/{project_slug}/runs/{id}`), which — like transcription /
 * attachment — authenticates the *user JWT* (`eyJ...`), not the per-project
 * `tstmt_` token. It returns `attributes.{tests-count,passed,failed,skipped}`
 * in a single request, so the widget no longer has to page through every
 * testrun to tally statuses.
 */

export async function testomatioRunStats(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  const runId = url.searchParams.get("run_id");
  if (!sessionId) {
    return Response.json({ error: "session required" }, { status: 400 });
  }
  if (!runId) {
    return Response.json({ error: "run_id required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  const target = resolveTestomatioTarget(session);
  if ("error" in target) {
    return Response.json({ error: target.error }, { status: 400 });
  }
  const auth = loadStoredAuth();
  if (!auth) {
    return Response.json({ error: "Sign in to Testomat.io" }, { status: 401 });
  }

  const upstream = new URL(
    `/api/${encodeURIComponent(target.projectSlug)}/runs/${encodeURIComponent(runId)}`,
    target.baseUrl
  );
  const { res, text } = await loggedServerFetch(upstream.toString(), {
    headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    return Response.json(
      { error: `run stats failed (HTTP ${res.status})` },
      { status: res.status }
    );
  }

  const attrs = runAttributes(text);
  return Response.json({
    tests_count: numberOrUndefined(attrs["tests-count"]),
    passed: numberOrUndefined(attrs["passed"]),
    failed: numberOrUndefined(attrs["failed"]),
    skipped: numberOrUndefined(attrs["skipped"]),
    status: typeof attrs["status"] === "string" ? attrs["status"] : undefined,
  });
}

function runAttributes(text: string): Record<string, unknown> {
  try {
    const json = JSON.parse(text) as {
      data?: { attributes?: Record<string, unknown> };
    };
    return json?.data?.attributes ?? {};
  } catch {
    return {};
  }
}

function numberOrUndefined(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  return undefined;
}
