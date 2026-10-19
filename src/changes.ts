import { run } from "./exec.js";

/** The git questions a pipeline asks about its checkout. */
export class Git {
  constructor(private readonly cwd: string) {}

  async headCommit(): Promise<string | null> {
    const head = await this.git("rev-parse", "HEAD");
    if (head.code !== 0) return null;
    return head.stdout.trim();
  }

  /**
   * The files this change touched. A later round counts from the commit the last
   * round ran on; the first round, or a `since` the checkout cannot reach (a
   * force-push), counts from the merge base with the target branch.
   */
  async changes(since: string | null, env: Env): Promise<Changes> {
    if (since && (await this.reachable(since))) return this.diff(since, since);

    const base = this.baseBranch(env);
    const mergeBase = await this.git("merge-base", base, "HEAD");
    if (mergeBase.code !== 0) {
      return { files: null, from: base, error: `cannot find where HEAD left ${base}` };
    }
    return this.diff(mergeBase.stdout.trim(), base);
  }

  /** The target branch, as the CI names it. */
  private baseBranch(env: Env): string {
    if (env.GITHUB_BASE_REF) return `origin/${env.GITHUB_BASE_REF}`;
    if (env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME) return `origin/${env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME}`;
    if (env.BITBUCKET_PR_DESTINATION_BRANCH) return `origin/${env.BITBUCKET_PR_DESTINATION_BRANCH}`;
    return env.BASE_BRANCH || "origin/main";
  }

  private async diff(from: string, label: string): Promise<Changes> {
    const names = await this.git("diff", "--name-only", from, "HEAD");
    if (names.code !== 0) return { files: null, from: label, error: names.stderr.trim() };
    return { files: names.stdout.split("\n").filter(Boolean), from: label };
  }

  private async reachable(commit: string): Promise<boolean> {
    const found = await this.git("cat-file", "-e", `${commit}^{commit}`);
    return found.code === 0;
  }

  private git(...args: string[]) {
    return run("git", args, { cwd: this.cwd });
  }
}

type Env = Record<string, string | undefined>;

export interface Changes {
  /** Null when git could not say. */
  files: string[] | null;
  /** The commit or branch they were counted from. */
  from: string;
  error?: string;
}
