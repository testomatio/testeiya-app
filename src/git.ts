import { run } from "./exec.js";

/** The git questions the CLI asks about its checkout. */
export class Git {
  constructor(private readonly cwd: string) {}

  headCommit(): Promise<string | null> {
    return this.read("rev-parse", "HEAD");
  }

  /** The PR source branch in CI, or the checked-out branch locally. */
  async branch(env: Env = process.env): Promise<string | null> {
    if (env.GITHUB_HEAD_REF) return env.GITHUB_HEAD_REF;
    if (env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME) return env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME;
    if (env.BITBUCKET_BRANCH) return env.BITBUCKET_BRANCH;
    return this.read("branch", "--show-current");
  }

  /**
   * Where the checkout stands, read once. The marker stamps the commit on a
   * comment, the pull request section picks its host from the remote, and the
   * checkpoint keeps both for the next round — one set of git calls for all three.
   */
  async repo(): Promise<Repo> {
    const commit = await this.headCommit();
    const branch = await this.read("rev-parse", "--abbrev-ref", "HEAD");
    const remote = await this.read("remote", "get-url", "origin");
    return { commit, branch, remote };
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

  /** Trimmed stdout, or null when git fails or says nothing. */
  private async read(...args: string[]): Promise<string | null> {
    const result = await this.git(...args);
    if (result.code !== 0) return null;
    return result.stdout.trim() || null;
  }

  private git(...args: string[]) {
    return run("git", args, { cwd: this.cwd });
  }
}

type Env = Record<string, string | undefined>;

export interface Repo {
  commit: string | null;
  branch: string | null;
  remote: string | null;
}

export interface Changes {
  /** Null when git could not say. */
  files: string[] | null;
  /** The commit or branch they were counted from. */
  from: string;
  error?: string;
}
