import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const { shell, yell } = global.bunosh;

export const ROOT = import.meta.dirname;
export const TESTEIYA_CLI = join(ROOT, "dist", "src", "cli.js");
export const PLAYGROUND = join(homedir(), ".cache", "testeiya-playground");

/** Build the CLI into dist/. */
export async function build() {
  const built = await shell`npm --prefix ${ROOT} run build`;
  return !built.hasFailed;
}

/** Copy the skills of testomatio/skills into skills/. Pipelines need them. */
export async function skills() {
  await shell`node ${join(ROOT, "scripts", "vendor-skills.js")}`;
}

/** Run the test suite. */
export async function test() {
  await shell`npm --prefix ${ROOT} test`;
}

/** GitHub helpers the ci and pipeline commands share. Not functions, so bunosh lists no command for them. */
export const github = {
  /** A GitHub pull request or issue, from its url or owner/repo#number. */
  parseTarget(input) {
    if (!input) return null;
    for (const kind of ["pull", "issues"]) {
      if (!input.includes(`/${kind}/`)) continue;
      const [base, tail] = input.split(`/${kind}/`);
      const parts = base.split("/");
      return { repo: `${parts.at(-2)}/${parts.at(-1)}`, number: Number(tail.split("/")[0]), kind };
    }
    if (input.includes("#")) {
      const [repo, number] = input.split("#");
      return { repo, number: Number(number), kind: "pull" };
    }
    return null;
  },

  /** A full clone of the repo in the playground, reused between runs. */
  async cloneRepo(repo) {
    const dir = join(PLAYGROUND, repo.replaceAll("/", "-"));
    mkdirSync(PLAYGROUND, { recursive: true });
    if (existsSync(dir)) return dir;
    // Full history, because a later round diffs back to the commit the last one ran on.
    const clone = await shell`gh repo clone ${repo} ${dir}`;
    if (clone.hasFailed) return yell("clone failed");
    return dir;
  },

  // Captured, never streamed: `shell` would echo the token into the terminal.
  token() {
    const auth = Bun.spawnSync(["gh", "auth", "token"]);
    if (!auth.success) return "";
    return auth.stdout.toString().trim();
  },
};
