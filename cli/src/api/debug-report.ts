import { recordClientReport } from "../debug-bus.js";

/*
 * `POST /api/debug/report` — the browser pushes its unified activity log
 * (`api` + `agent` + `console` channels), a MobX store snapshot, and page meta.
 * Kept as the latest report for the session so `GET /api/debug/snapshot` can
 * hand the agent the full client-side picture the server never sees otherwise.
 */

const MAX_ENTRIES = 300;

export async function debugReport(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid report" }, { status: 400 });
  }
  const report = body as Record<string, unknown>;
  const entries = Array.isArray(report.entries) ? report.entries.slice(-MAX_ENTRIES) : [];
  recordClientReport({
    sessionId: typeof report.sessionId === "string" ? report.sessionId : null,
    reason: typeof report.reason === "string" ? report.reason : "report",
    reportedAt: new Date().toISOString(),
    entries,
    store: report.store ?? null,
    meta: report.meta ?? null,
    layout: report.layout ?? null,
  });
  return Response.json({ ok: true });
}
