// Project configuration from `GET /api/v2/{project_id}/info` (framework,
// subscription, environments, labels, tags, feature flags, CI profiles).
//
// Fetched when a project is selected (agent-start) and cached in the
// workspace's `.testeiya/project-info.json`, so the session factory can inject
// a compact summary into the system prompt without a network round-trip. The
// full JSON stays agent-readable on disk — the prompt points at it instead of
// inlining every label/tag when the lists are long.

import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./json-store.js";
import { loggedServerFetch } from "./debug-bus.js";
import { PROJECT_DIR, projectInfoPath } from "./project-dir.js";
import { resolveProjectTarget } from "./api/testomatio-target.js";
import type { StoredSession } from "./session-store.js";

const TTL_MS = 60 * 60 * 1000;

export async function fetchProjectInfo(
  baseUrl: string,
  slug: string,
  token: string
): Promise<TestomatioProjectInfo | null> {
  const url = new URL(
    `/api/v2/${encodeURIComponent(slug)}/info`,
    baseUrl.replace(/\/$/, "")
  ).toString();
  try {
    const { res, text } = await loggedServerFetch(
      url,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
      null
    );
    if (!res.ok) return null;
    const parsed = JSON.parse(text) as { data?: TestomatioProjectInfo };
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function readProjectInfo(cwd: string): StoredProjectInfo | null {
  const raw = readJson<Partial<StoredProjectInfo>>(projectInfoPath(cwd), {});
  if (!raw?.info?.project_id) return null;
  return { fetchedAt: raw.fetchedAt ?? 0, info: raw.info };
}

export function writeProjectInfo(cwd: string, info: TestomatioProjectInfo): void {
  writeJson(projectInfoPath(cwd), { fetchedAt: Date.now(), info });
  // Keep the cache out of the user's repo history (same rule as writeProjectMeta).
  fs.writeFileSync(path.join(cwd, PROJECT_DIR, ".gitignore"), "*\n", "utf8");
}

/**
 * The workspace's project settings for the system prompt: the cached copy when
 * fresh, else re-fetched via the session's resolvable credentials and re-cached.
 * Falls back to the stale cache when no credentials resolve or the fetch fails.
 * Multi-project sessions have no single settings set, so they resolve to null.
 */
export async function resolveProjectInfo(
  cwd: string,
  session: Pick<StoredSession, "tokens" | "backendUrl" | "projects">
): Promise<TestomatioProjectInfo | null> {
  if ((session.projects?.length ?? 0) > 1) return null;
  const cached = readProjectInfo(cwd);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.info;
  const target = await resolveProjectTarget(session, cwd);
  if (!target) return cached?.info ?? null;
  const info = await fetchProjectInfo(target.baseUrl, target.project, target.token);
  if (!info) return cached?.info ?? null;
  writeProjectInfo(cwd, info);
  return info;
}

export interface TestomatioCiProfile {
  profile_name: string;
  service: string | null;
  config: Record<string, unknown> | null;
  pass_testomatio_key: boolean;
  pass_testomatio_url: boolean;
  pass_run_id: boolean;
}

export interface TestomatioProjectInfo {
  title: string;
  project_id: string;
  framework: string | null;
  language: string | null;
  status: string | null;
  repository_url: string | null;
  artifacts_storage_enabled: boolean;
  environments: string[];
  labels: { title: string; slug: string }[];
  tags: string[];
  subscription: string | null;
  features: string[];
  ci_profiles: TestomatioCiProfile[];
}

export interface StoredProjectInfo {
  fetchedAt: number;
  info: TestomatioProjectInfo;
}
