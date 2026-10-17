import { matchesGlob } from "node:path";

import { run } from "./exec.js";
import type { ChangesRule } from "./pipeline-file.js";

export async function headCommit(cwd: string): Promise<string | null> {
  const head = await run("git", ["rev-parse", "HEAD"], { cwd });
  if (head.code !== 0) return null;
  return head.stdout.trim();
}

/**
 * The files this change touched. A later round counts from the commit the last
 * round ran on; the first round, or a `since` the checkout cannot reach (a
 * force-push), counts from the merge base with the target branch.
 */
export async function readChanges(cwd: string, since: string | null, env: Env): Promise<Changes> {
  if (since && (await reachable(cwd, since))) return diff(cwd, since, since);

  const base = baseBranch(env);
  const mergeBase = await run("git", ["merge-base", base, "HEAD"], { cwd });
  if (mergeBase.code !== 0) {
    return { files: null, from: base, error: `cannot find where HEAD left ${base}` };
  }
  return diff(cwd, mergeBase.stdout.trim(), base);
}

/** Whether the changed files satisfy a `changes` check. */
export function matchChanges(files: string[], rule: ChangesRule): boolean {
  const counted = files.filter((file) => !(rule.ignore ?? []).some((mask) => matchesGlob(file, mask)));
  if (rule.minFiles && counted.length < rule.minFiles) return false;
  if (rule.paths && !counted.some((file) => rule.paths!.some((mask) => matchesGlob(file, mask)))) return false;
  return counted.length > 0;
}

/** The target branch, as the CI names it. */
export function baseBranch(env: Env): string {
  if (env.GITHUB_BASE_REF) return `origin/${env.GITHUB_BASE_REF}`;
  if (env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME) return `origin/${env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME}`;
  if (env.BITBUCKET_PR_DESTINATION_BRANCH) return `origin/${env.BITBUCKET_PR_DESTINATION_BRANCH}`;
  return env.BASE_BRANCH || "origin/main";
}

async function diff(cwd: string, from: string, label: string): Promise<Changes> {
  const names = await run("git", ["diff", "--name-only", from, "HEAD"], { cwd });
  if (names.code !== 0) return { files: null, from: label, error: names.stderr.trim() };
  return { files: names.stdout.split("\n").filter(Boolean), from: label };
}

async function reachable(cwd: string, commit: string): Promise<boolean> {
  const found = await run("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd });
  return found.code === 0;
}

type Env = Record<string, string | undefined>;

export interface Changes {
  /** Null when git could not say. */
  files: string[] | null;
  /** The commit or branch they were counted from. */
  from: string;
  error?: string;
}
