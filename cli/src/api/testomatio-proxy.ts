import { getSession, type StoredSession } from "../session-store.js";
import { loggedServerFetch } from "../debug-bus.js";

/*
 * Generic proxy for Testomat.io v2 REST.
 *
 *   GET /api/testomatio/{resource}?session=<sid>                 → list
 *   GET /api/testomatio/{resource}?session=<sid>&id=<id>         → detail
 *   GET /api/testomatio/{resource}?session=<sid>&<filter>=<val>  → filtered list
 *   PUT /api/testomatio/{resource}?session=<sid>&id=<id>         → update (writable only)
 *   POST /api/testomatio/{resource}?session=<sid>               → create (creatable only)
 *
 * Upstream call: `${session.backendUrl}/api/v2/{project_slug}/{resource}[/{id}]`
 * Auth: `Authorization: Bearer ${session.tokens[slug]}` (per v2 spec).
 * Only resources + filters on the whitelists reach upstream (SSRF guard);
 * updates are limited to WRITABLE_RESOURCES (always need an id), creates to
 * CREATABLE_RESOURCES (collection POST, no id).
 */

const ALLOWED_RESOURCES = new Set([
  "runs",
  "tests",
  "suites",
  "plans",
  "testruns",
  "rungroups",
  "issues", // backs the UI "Requirements" view
  "info", // project configuration (subscription, features, framework, …)
  "labels", // label definitions (title, color, visibility) for the config view
]);

const WRITABLE_RESOURCES = new Set(["testruns", "runs"]);

const CREATABLE_RESOURCES = new Set(["runs"]);

const COMMON_FILTERS = ["page", "per_page", "query"];

const RESOURCE_FILTERS: Record<string, string[]> = {
  tests: [
    "search_text",
    "suites[]",
    "tags[]",
    "user",
    "labels[]",
    "priority",
    "state",
    "sync_status",
    "milestones[]",
    "tql",
    "wildcard_tag",
  ],
  suites: ["file_type", "tag", "labels", "search_text"],
  plans: ["kind", "hidden", "labels[]", "search_text"],
  runs: [
    "with_rungroups",
    "search",
    "tql",
    "groupId",
    "jira_ids",
    "filter[status]",
    "filter[kind]",
    "filter[user]",
    "filter[created_by]",
    "filter[env]",
    "filter[unfinished]",
    "filter[archived]",
    "filter[in_group]",
    "filter[milestone]",
    "filter[labels][]",
  ],
  testruns: [
    "run_id",
    "test_ids",
    "filter[status]",
    "filter[kind]",
    "filter[user]",
    "filter[priority]",
    "filter[substatus]",
    "filter[search]",
    "filter[message]",
    "filter[link]",
    "filter[finished_at_date_range]",
    "tags",
    "labels",
    "envs",
    "rungroups",
    "defects",
  ],
  rungroups: [],
  issues: ["test_id", "suite_id", "run_id", "testrun_id", "plan_id", "source"],
  info: [],
  labels: [],
};

export async function testomatioProxy(
  req: Request,
  resource: string
): Promise<Response> {
  if (!ALLOWED_RESOURCES.has(resource)) {
    return Response.json({ error: "bad resource" }, { status: 400 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  const id = url.searchParams.get("id");
  const slug = url.searchParams.get("slug");

  if (!sessionId) {
    return Response.json({ error: "session required" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  const target = resolveTestomatioTarget(session, slug);
  if ("error" in target) {
    return Response.json({ error: target.error }, { status: 400 });
  }
  const { baseUrl, projectSlug, token } = target;

  const method = req.method.toUpperCase();
  const path = id
    ? `/api/v2/${encodeURIComponent(projectSlug)}/${resource}/${encodeURIComponent(id)}`
    : `/api/v2/${encodeURIComponent(projectSlug)}/${resource}`;
  const upstream = new URL(path, baseUrl);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { headers, cache: "no-store" };
  let requestBody: string | null = null;

  if (method === "POST") {
    if (!CREATABLE_RESOURCES.has(resource)) {
      return Response.json({ error: "resource not creatable" }, { status: 400 });
    }
    headers["Content-Type"] = "application/json";
    init.method = "POST";
    requestBody = await req.text();
    init.body = requestBody;
  }

  if (method === "PUT") {
    if (!WRITABLE_RESOURCES.has(resource)) {
      return Response.json({ error: "resource not writable" }, { status: 400 });
    }
    if (!id) {
      return Response.json({ error: "id required" }, { status: 400 });
    }
    headers["Content-Type"] = "application/json";
    init.method = "PUT";
    requestBody = await req.text();
    init.body = requestBody;
  }

  if (method === "GET") {
    for (const [k, v] of url.searchParams) {
      if (v && isAllowedFilter(resource, k)) upstream.searchParams.append(k, v);
    }
  }

  const { res, text: body } = await loggedServerFetch(
    upstream.toString(),
    init,
    requestBody
  );
  return new Response(body, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Resolve a session to its Testomat.io call target: the project slug (explicit
 * or the session's first project), that project's bearer token, and the base
 * URL (trailing slash stripped). Shared by the proxy and the attachment upload.
 */
export function resolveTestomatioTarget(
  session: StoredSession,
  slug?: string | null
): { baseUrl: string; projectSlug: string; token: string } | { error: string } {
  const projectSlug = slug ?? session.projects[0]?.slug;
  const token = projectSlug ? session.tokens?.[projectSlug] : undefined;
  const baseUrl = session.backendUrl;
  if (!projectSlug || !token || !baseUrl) {
    return { error: "session missing project slug, token, or backendUrl" };
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), projectSlug, token };
}

function isAllowedFilter(resource: string, key: string): boolean {
  if (COMMON_FILTERS.includes(key)) return true;
  return RESOURCE_FILTERS[resource]?.includes(key) ?? false;
}
