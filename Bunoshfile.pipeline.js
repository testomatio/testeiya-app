import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT as TESTEIYA_PACKAGE, TESTEIYA_CLI, build as buildTesteiya, github } from "./Bunoshfile.js";

const { shell, say, assert } = global.bunosh;

// OpenRouter's alias for the newest Haiku, Haiku 5.5 today. The CLI's model catalog does not list 5.5 yet.
const MODEL = "openrouter/~anthropic/claude-haiku-latest";
const OUT = "pipeline-runs";

/**
 * Run the pr-review pipeline on a pull request: review, test cases, sync.
 * @param {string} url - Pull request or issue url, or owner/repo#number
 * @param {object} options
 * @param {string} [options.out=pipeline-runs] - Folder for runs, relative to where you run bunosh
 * @param {string} [options.model] - Model, Haiku 5.5 by default
 * @param {boolean} [options.post=false] - Post the summary on the pull request
 * @param {boolean} [options.dry=false] - Show gates and stages, spend nothing
 * @param {boolean} [options.fresh=false] - Forget earlier rounds of this run
 */
export function pipelinePrReview(url, options = { out: OUT, model: MODEL, post: false, dry: false, fresh: false }) {
  return runPipeline("pr-review", url, options);
}

/**
 * Run the web-testing pipeline: review, Explorbot plan and browser test. Needs EXPLORBOT_URL.
 * @param {string} url - Pull request or issue url, or owner/repo#number
 * @param {object} options
 * @param {string} [options.out=pipeline-runs] - Folder for runs, relative to where you run bunosh
 * @param {string} [options.model] - Model, Haiku 5.5 by default
 * @param {boolean} [options.post=false] - Post the summary on the pull request
 * @param {boolean} [options.dry=false] - Show gates and stages, spend nothing
 * @param {boolean} [options.fresh=false] - Forget earlier rounds of this run
 */
export function pipelineWebTesting(url, options = { out: OUT, model: MODEL, post: false, dry: false, fresh: false }) {
  return runPipeline("web-testing", url, options);
}

/**
 * Run the api-testing pipeline: find changed endpoints, Explorbot tests each. Needs EXPLORBOT_API_SPEC.
 * @param {string} url - Pull request or issue url, or owner/repo#number
 * @param {object} options
 * @param {string} [options.out=pipeline-runs] - Folder for runs, relative to where you run bunosh
 * @param {string} [options.model] - Model, Haiku 5.5 by default
 * @param {boolean} [options.post=false] - Post the summary on the pull request
 * @param {boolean} [options.dry=false] - Show gates and stages, spend nothing
 * @param {boolean} [options.fresh=false] - Forget earlier rounds of this run
 */
export function pipelineApiTesting(url, options = { out: OUT, model: MODEL, post: false, dry: false, fresh: false }) {
  return runPipeline("api-testing", url, options);
}

/**
 * Run the issue-test-cases pipeline: an issue or epic, with its sub-issues, becomes test cases.
 * @param {string} url - Issue url
 * @param {object} options
 * @param {string} [options.out=pipeline-runs] - Folder for runs, relative to where you run bunosh
 * @param {string} [options.model] - Model, Haiku 5.5 by default
 * @param {boolean} [options.dry=false] - Show gates and stages, spend nothing
 * @param {boolean} [options.fresh=false] - Forget earlier rounds of this run
 */
export function pipelineIssueTestCases(url, options = { out: OUT, model: MODEL, dry: false, fresh: false }) {
  if (github.parseTarget(url)?.kind !== "issues") return fail(`"${url}" is not an issue url`);
  return runPipeline("issue-test-cases", url, options);
}

/**
 * Run the regression pipeline: tests mapped by coverage.tests.yml, then triage. Needs TESTOMATIO.
 * @param {string} url - Pull request or issue url, or owner/repo#number
 * @param {object} options
 * @param {string} [options.out=pipeline-runs] - Folder for runs, relative to where you run bunosh
 * @param {string} [options.model] - Model, Haiku 5.5 by default
 * @param {boolean} [options.post=false] - Post the summary on the pull request
 * @param {boolean} [options.dry=false] - Show gates and stages, spend nothing
 * @param {boolean} [options.fresh=false] - Forget earlier rounds of this run
 */
export function regression(url, options = { out: OUT, model: MODEL, post: false, dry: false, fresh: false }) {
  return runPipeline("regression", url, options);
}

/**
 * Run your own pipeline file on a pull request or issue.
 * @param {string} path - Path to a pipeline .yml
 * @param {string} url - Pull request or issue url, or owner/repo#number
 * @param {object} options
 * @param {string} [options.out=pipeline-runs] - Folder for runs, relative to where you run bunosh
 * @param {string} [options.model] - Model, Haiku 5.5 by default
 * @param {boolean} [options.post=false] - Post the summary on the pull request
 * @param {boolean} [options.dry=false] - Show gates and stages, spend nothing
 * @param {boolean} [options.fresh=false] - Forget earlier rounds of this run
 */
export function file(path, url, options = { out: OUT, model: MODEL, post: false, dry: false, fresh: false }) {
  return runPipeline(resolve(path), url, options);
}

async function runPipeline(name, url, options) {
  const target = github.parseTarget(url);
  if (!target) return fail(`cannot read a pull request or issue from "${url}"`);
  if (!vendoredSkills()) return fail("no skills vendored, run node scripts/vendor-skills.js");

  const token = github.token();
  if (!token) return fail("gh is not logged in, run gh auth login");

  if (!(await buildTesteiya())) return;

  const checkout = await github.cloneRepo(target.repo);
  if (!checkout) return;
  const base = await checkOut(target, checkout);
  if (!base) return;

  const slug = `${target.repo.replaceAll("/", "-")}-${target.kind}-${target.number}`;
  const label = name.split("/").at(-1).replace(".yml", "");
  const dir = resolve(options.out || OUT, slug, label);
  if (options.fresh) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const args = [TESTEIYA_CLI, "pipeline", name, "--dir", dir, "--model", options.model || MODEL, "-o", `${dir}.md`];
  for (const [key, value] of Object.entries(targetVars(target))) args.push("--set", `${key}=${value}`);
  if (options.dry) args.push("--dry-run");
  const post = options.post && target.kind === "pull";
  if (post) args.push("-o", `gh:pr#${target.number}`, "--thread", `pipeline-${label}`);

  say(`  ${target.repo} ${target.kind} #${target.number} · ${label} · ${options.model || MODEL}`);
  say(`  checkout ${checkout} · base ${base}`);
  say(`  folder ${dir}`);
  if (!post) say("  nothing is posted, pass --post to comment on the pull request");

  // Spawned rather than shelled: an argument list needs no quoting, and the stages' output reaches the terminal.
  const run = Bun.spawn(["node", ...args], {
    cwd: checkout,
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, GH_TOKEN: token, GITHUB_REPOSITORY: target.repo, BASE_BRANCH: base },
  });
  const code = await run.exited;
  if (code !== 0) return fail(`pipeline exited ${code}`);
  if (!options.dry) say(`  report ${dir}.md`);
}

/** A pull request is checked out as its own branch, so `gh pr view` finds it. An issue gets the default branch. */
async function checkOut(target, checkout) {
  if (target.kind === "issues") {
    const fetched = await shell`git -C ${checkout} fetch --force origin`;
    if (fetched.hasFailed) return null;
    const head = await shell`git -C ${checkout} checkout --force --detach origin/HEAD`;
    if (head.hasFailed) return null;
    return "origin/HEAD";
  }

  const pr = await shell`gh pr checkout ${target.number} --repo ${target.repo} --force`.cwd(checkout);
  if (pr.hasFailed) return null;
  const view = await shell`gh pr view ${target.number} --repo ${target.repo} --json baseRefName --jq .baseRefName`.cwd(checkout);
  if (view.hasFailed) return null;
  const branch = (await view.json()).stdout.trim();
  const fetched = await shell`git -C ${checkout} fetch --force origin ${branch}`;
  if (fetched.hasFailed) return null;
  return `origin/${branch}`;
}

function targetVars(target) {
  const url = `https://github.com/${target.repo}/${target.kind}/${target.number}`;
  if (target.kind === "issues") return { ISSUE_NUMBER: target.number, ISSUE_URL: url };
  return { PR_NUMBER: target.number, PR_URL: url };
}

function vendoredSkills() {
  const dir = join(TESTEIYA_PACKAGE, "skills");
  if (!existsSync(dir)) return false;
  return readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isDirectory());
}

function fail(message) {
  assert(false, message);
}
