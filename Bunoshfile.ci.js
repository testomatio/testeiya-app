import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PLAYGROUND, TESTEIYA_CLI, build as buildTesteiya, github } from "./Bunoshfile.js";

const { shell, say, yell, assert } = global.bunosh;

const REVIEW_TASK = "Review this pull request as a senior QA engineer. /qa-review-pr";
const REVIEW_FOOTER = "> Reply to this comment with /testeiya followed by your QA follow-up.";

/**
 * Run the CI pull request review here, the way the workflow runs it.
 *
 * Builds and runs this checkout. The review reads a cached clone of the pull
 * request's merge result, never your own working tree. Prints the thread when
 * it finishes, so you can see which comments folded.
 * @param {string} pr - Pull request url, or owner/repo#number
 * @param {object} options
 * @param {string} [options.thread=playground] - Thread name; keep it off the CI thread
 * @param {string} [options.model] - Overrides TESTEIYA_MODEL
 * @param {string} [options.followUp] - Reply text, as a /testeiya comment would send it
 * @param {boolean} [options.dry=false] - Print the report instead of posting it
 * @param {boolean} [options.fresh=false] - Start a new session instead of resuming
 */
export async function review(
  pr,
  options = { thread: "playground", model: "", followUp: "", dry: false, fresh: false }
) {
  // Each guard reports only when it trips: `assert` prints its message either
  // way, so a passing one reads like the failure it was meant to describe.
  const target = github.parseTarget(pr);
  if (!target) return fail(`cannot read a pull request from "${pr}" — pass a url or owner/repo#number`);

  const name = options.thread || "playground";
  if (name === "default") return fail("default is the CI thread — pick another --thread");

  const model = options.model || process.env.TESTEIYA_MODEL;
  if (!model) return fail("no model — set TESTEIYA_MODEL or pass --model <provider>/<id>");

  const token = github.token();
  if (!token) return fail("gh is not logged in — run `gh auth login`");

  const checkout = await clonePullRequest(target);
  if (!checkout) return;

  const slug = `${target.repo.replaceAll("/", "-")}-pr-${target.number}`;
  const session = join(PLAYGROUND, "sessions", `${slug}-${name}.jsonl`);
  const out = join(PLAYGROUND, "out", slug);
  mkdirSync(join(PLAYGROUND, "sessions"), { recursive: true });
  mkdirSync(out, { recursive: true });
  if (options.fresh) rmSync(session, { force: true });

  say(`  ${target.repo}#${target.number} · thread ${name} · ${model}`);
  say(`  session ${existsSync(session) ? "resumes" : "starts"} at ${session}`);
  say(`  ${options.dry ? "dry run, nothing is posted" : "posts a comment on the pull request"}`);

  const args = [
    "task",
    REVIEW_TASK,
    "--exit-zero",
    "--thread",
    name,
    "--session-file",
    session,
    "--model",
    model,
    "-o",
    join(out, "report.md"),
    "-o",
    join(out, "result.json"),
    "--footer",
    REVIEW_FOOTER,
  ];
  if (!options.dry) args.push("-o", `gh:pr#${target.number}`);

  // Spawned rather than shelled: an argument list needs no quoting, and the
  // agent's own progress reaches the terminal instead of a command echo.
  if (!(await buildTesteiya())) return;
  const run = Bun.spawn(["node", TESTEIYA_CLI, ...args], {
    cwd: checkout,
    stdio: ["inherit", "inherit", "inherit"],
    env: {
      ...process.env,
      // Without these the CLI reads a developer's laptop, drops the whole
      // comment-thread section, and the run rehearses a path CI never takes.
      CI: "true",
      GITHUB_ACTIONS: "true",
      GH_TOKEN: token,
      TESTEIYA_FOLLOW_UP: options.followUp || "",
    },
  });

  const code = await run.exited;
  if (code !== 0) return fail(`testeiya exited ${code}`);

  say(`  report ${join(out, "report.md")}`);
  if (options.dry) return;
  await printThread(target, name);
}

/**
 * Print a pull request's testeiya comments and say which ones are folded.
 * @param {string} pr - Pull request url, or owner/repo#number
 * @param {object} options
 * @param {string} [options.thread] - One thread; every testeiya thread by default
 */
export async function thread(pr, options = { thread: "" }) {
  const target = github.parseTarget(pr);
  if (!target) return fail(`cannot read a pull request from "${pr}"`);
  await printThread(target, options.thread);
}

async function printThread(target, name) {
  const view = await shell`gh pr view ${target.number} --repo ${target.repo} --json comments`.env({
    ...process.env,
    GH_PAGER: "cat",
  });
  if (view.hasFailed) return;

  const comments = JSON.parse((await view.json()).stdout).comments ?? [];
  const prefix = name ? `<!-- testeiya thread=${name} ` : "<!-- testeiya";
  const mine = comments.filter((comment) => comment.body?.startsWith(prefix));
  if (mine.length === 0) return say("  no testeiya comments on this pull request");

  say(`  ${mine.length} testeiya comments, oldest first:`);
  for (const comment of mine) {
    say(`  ${comment.isMinimized ? "folded " : "SHOWING"}  ${comment.body.split("\n")[0]}`);
  }
  const showing = mine.filter((comment) => !comment.isMinimized).length;
  if (showing > 1) yell(`${showing} comments still showing`);
}

async function clonePullRequest(target) {
  const dir = await github.cloneRepo(target.repo);
  if (!dir) return;

  const ref = `refs/pull/${target.number}/merge`;
  const fetched = await shell`git -C ${dir} fetch --force origin ${ref}:${ref}`;
  if (fetched.hasFailed) return yell(`no merge ref for #${target.number} — is the pull request open?`);

  const checkout = await shell`git -C ${dir} checkout --force --detach ${ref}`;
  if (checkout.hasFailed) return yell("checkout failed");
  return dir;
}

function fail(message) {
  assert(false, message);
}
