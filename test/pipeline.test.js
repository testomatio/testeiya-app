import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Git } from "../dist/src/git.js";
import { Diagram } from "../dist/src/pipeline/diagram.js";
import { Gate } from "../dist/src/pipeline/gate.js";
import { Pipeline } from "../dist/src/pipeline/pipeline.js";
import { Overlay } from "../dist/src/pipeline/overlay.js";
import { PipelineFile } from "../dist/src/pipeline/pipeline-file.js";
import { CommandStage } from "../dist/src/pipeline/command-stage.js";
import { Stage } from "../dist/src/pipeline/stage.js";
import { StageEnv } from "../dist/src/pipeline/stage-env.js";
import { CrashGuard } from "../dist/src/pipeline/crash-guard.js";
import { SummaryStage } from "../dist/src/pipeline/summary-stage.js";
import { TaskStage } from "../dist/src/pipeline/task-stage.js";
import { KILL_GRACE_MS } from "../dist/src/pipeline/launcher.js";
import { Variables } from "../dist/src/pipeline/variables.js";
import { UsageError } from "../dist/src/model.js";

// A pull request run in CI names its own branches; the tests name theirs.
for (const name of Object.keys(process.env)) {
  if (name.startsWith("GITHUB_") || name.startsWith("CI_MERGE_REQUEST_") || name.startsWith("BITBUCKET_")) delete process.env[name];
}

const parse = (text) => new PipelineFile("p.yml").parse(text);

// Stands in for runTask: logs the request and the env it ran in, writes the
// stage's files. "FAIL" in a task is a negative verdict; "SLOW" waits for the
// abort when FAKE_SLOW is set; "STUCK" ignores it; "BADMODEL" is bad usage.
function fakeTask(log) {
  return async (request, control) => {
    const { prompt } = request;
    appendFileSync(log, JSON.stringify({ ...request, env: { STAGE_DIR: process.env.STAGE_DIR, ITEM: process.env.ITEM } }) + "\n");
    if (prompt.includes("INT")) process.emit("SIGINT");
    if ((process.env.FAKE_SLOW && prompt.includes("SLOW")) || prompt.includes("INT")) {
      await new Promise((done) => control.signal.addEventListener("abort", done));
      return { code: 1, envelope: { status: "fail", reason: "interrupted" }, undelivered: false };
    }
    if (prompt.includes("STUCK")) await new Promise(() => {});
    if (prompt.includes("LATE")) await new Promise((done) => setTimeout(done, KILL_GRACE_MS + 3000));
    if (prompt.includes("BADMODEL")) throw new UsageError("no such model");
    const wanted = prompt.match(/Write these files: (.*)/);
    for (const file of wanted ? wanted[1].split(", ") : []) writeFileSync(file, "written\n");
    const status = prompt.includes("FAIL") ? "fail" : "pass";
    for (const out of request.outputs) {
      if (out.endsWith(".json")) writeFileSync(out, JSON.stringify({ status, reason: "found it" }));
      else if (!out.startsWith("gh:")) writeFileSync(out, "report of " + prompt.split("\n")[0] + "\n");
    }
    return { code: 0, envelope: { status, reason: "found it" }, undelivered: false };
  };
}

// Stands in for `testeiya task` on the spawn fallback: logs its argv, writes the report, the envelope
// and every file the task asks for. "FAIL" in a task is a negative verdict.
const FAKE = `
import { appendFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const task = args.at(-1);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + "\\n");
if (process.env.FAKE_SLOW && task.includes("SLOW")) await new Promise((done) => setTimeout(done, 20000));
const wanted = task.match(/Write these files: (.*)/);
for (const file of wanted ? wanted[1].split(", ") : []) writeFileSync(file, "written\\n");
for (let i = 0; i < args.length; i++) {
  if (args[i] !== "-o") continue;
  const out = args[i + 1];
  if (out.endsWith(".json")) writeFileSync(out, JSON.stringify({ status: task.includes("FAIL") ? "fail" : "pass", reason: "found it" }));
  else writeFileSync(out, "report of " + task.split("\\n")[0] + "\\n");
}
`;

test("a stage sees only its own env, and the parent gets its own back", async () => {
  process.env.PARENT_ONLY = "1";
  const seen = await new StageEnv({ STAGE_DIR: "/s", PATH: process.env.PATH }).run(async () => ({ ...process.env }));
  assert.equal(seen.STAGE_DIR, "/s");
  assert.equal(seen.PARENT_ONLY, undefined);
  assert.equal(process.env.PARENT_ONLY, "1");
  assert.equal(process.env.STAGE_DIR, undefined);
  delete process.env.PARENT_ONLY;
});

test("env is restored when the stage throws", async () => {
  await assert.rejects(new StageEnv({ ITEM: "a" }).run(async () => { throw new Error("boom"); }), /boom/);
  assert.equal(process.env.ITEM, undefined);
});

test("process.env stays the same object", async () => {
  const before = process.env;
  await new StageEnv({ A: "1" }).run(async () => assert.equal(process.env, before));
});

test("every bundled pipeline loads", () => {
  const names = PipelineFile.bundled().map((pipeline) => pipeline.name);
  assert.deepEqual(names, ["api-testing", "issue-test-cases", "pr-review", "regression", "web-testing"]);
});

test("every bundled pipeline has a target", () => {
  const targets = PipelineFile.bundled().map((pipeline) => pipeline.target);
  assert.deepEqual(targets, ["pr", "issue", "pr", "pr", "pr"]);
  assert.throws(() => parse("target: [pr]\nstages:\n  - id: a\n    run: echo\n"), /target must be text/);
});

test("a stage naming an undefined gate is bad usage", () => {
  const text = "stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    run: echo\n    when: [staging]\n";
  assert.throws(() => parse(text), /names gate "staging"/);
});

test("a stage needs exactly one of task or run", () => {
  assert.throws(() => parse("stages:\n  - id: a\n    title: a\n    emoji: 🔹\n"), /exactly one of task or run/);
  const both = "stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    run: echo\n    task: hi\n";
  assert.throws(() => parse(both), /exactly one of task or run/);
});

test("a stage without a title or an emoji gets them from its id", () => {
  const [stage] = parse("stages:\n  - id: browser-testing\n    run: echo\n").stages;
  assert.equal(stage.title, "Browser testing");
  assert.ok(stage.emoji);
  assert.equal(parse("stages:\n  - id: browser-testing\n    run: echo\n").stages[0].emoji, stage.emoji);
});

test("reserved ids, unknown keys and stray stopOn are rejected", () => {
  assert.throws(() => parse("stages:\n  - id: summary\n    title: summary\n    emoji: 🔹\n    run: echo\n"), /reserved/);
  assert.throws(() => parse("stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    run: echo\n    model: x\n"), /unknown key "model"/);
  assert.throws(() => parse("stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    run: echo\n    stopOn: always\n"), /stopOn/);
});

test("an output may not reuse the stage's own file name, nor one of its inputs", async () => {
  const { repo, runTask } = setup();
  const check = (text) => inRepo(repo, () => new Pipeline({ name: write(repo, "pipe.yml", text), dir: join(repo, ".qa"), runTask, dryRun: true }).run());
  await assert.rejects(check("stages:\n  - id: plan\n    title: plan\n    emoji: 🔹\n    task: hi\n    outputs: [plan.md]\n"), /plan.md is a file the stage writes itself/);
  const edits = "stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    task: hi\n    outputs: [x.md]\n  - id: b\n    title: b\n    emoji: 🔹\n    task: hi\n    inputs: [x.md]\n    outputs: [x.md]\n";
  await assert.rejects(check(edits), /reads and writes x.md/);
});

test("durations read seconds, minutes and hours", () => {
  assert.equal(Stage.duration("90s"), 90_000);
  assert.equal(Stage.duration("30m"), 1_800_000);
  assert.equal(Stage.duration("1h"), 3_600_000);
  assert.equal(Stage.duration(5), 5_000);
  assert.equal(Stage.duration("soon"), null);
});

test("variables expand the shell's way", () => {
  assert.equal(new Variables({ A: "a" }).expand("${A}/x"), "a/x");
  assert.equal(new Variables({}).expand("${B:-origin/main}"), "origin/main");
  assert.equal(new Variables({}).expand("[${MISSING}]"), "[]");
});

test("a changes check counts what is not ignored", async () => {
  const files = ["src/api/users.ts", "README.md", "docs/a.md"];
  const passes = (changes, filesChanged = files) =>
    new Gate("g", { changes, message: "m" }).passes({ cwd: ".", vars: new Variables({}), changes: { files: filesChanged, from: "x" } });
  assert.equal(await passes({ min_files: 2, ignore: ["**/*.md", "*.md"] }), false);
  assert.equal(await passes({ paths: ["src/api/**"] }), true);
  assert.equal(await passes({ paths: ["src/ui/**"] }), false);
  assert.equal(await passes({ ignore: ["*.md"] }, ["README.md"]), false);
});

test("branch names come from CI source branches before the checkout", async () => {
  const repo = gitRepo();
  const checkout = new Git(repo);
  git(repo, "checkout", "-q", "-b", "feature/local");
  assert.equal(await checkout.branch({ GITHUB_HEAD_REF: "feature/github", CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: "feature/gitlab" }), "feature/github");
  assert.equal(await checkout.branch({ CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: "feature/gitlab", BITBUCKET_BRANCH: "feature/bitbucket" }), "feature/gitlab");
  assert.equal(await checkout.branch({ BITBUCKET_BRANCH: "feature/bitbucket" }), "feature/bitbucket");
  assert.equal(await checkout.branch({}), "feature/local");
  git(repo, "checkout", "-q", "--detach", "HEAD");
  assert.equal(await checkout.branch({}), null);
});

test("GIT_BRANCH reaches pipeline env and can be transformed", async () => {
  const { repo, cli } = setup();
  const file = write(repo, "pipe.yml", `
env:
  TESTOMATIO_BRANCH: \${GIT_BRANCH | slugify}
stages:
  - id: branch
    title: branch
    emoji: 🔹
    run: printf '%s\\n' "$GIT_BRANCH" "$TESTOMATIO_BRANCH"
`);
  const dir = join(repo, ".qa");
  const options = { name: file, dir, cli, sets: { GITHUB_HEAD_REF: "feature/new-tests" } };
  assert.equal(await inRepo(repo, () => new Pipeline(options).run()), 0);
  assert.equal(readFileSync(join(dir, "1-branch", "branch.log"), "utf8"), "feature/new-tests\nfeature-new-tests\n");
});

test("changes count from the merge base, then from the last round", async () => {
  const repo = gitRepo();
  git(repo, "checkout", "-q", "-b", "feature");
  commit(repo, "src/a.ts");
  commit(repo, "src/b.ts");
  const first = await new Git(repo).changes(null, { BASE_BRANCH: "main" });
  assert.deepEqual(first.files, ["src/a.ts", "src/b.ts"]);

  const since = git(repo, "rev-parse", "HEAD");
  commit(repo, "src/c.ts");
  const later = await new Git(repo).changes(since, { BASE_BRANCH: "main" });
  assert.deepEqual(later.files, ["src/c.ts"]);
});

test("a pipeline runs stages, skips closed gates, loops and summarizes", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
name: demo
gates:
  staging:
    env: [DEMO_STAGING_URL]
    message: No staging URL.
stages:
  - id: review
    title: review
    emoji: 🔹
    session: qa
    task: Review it.
    outputs: [endpoints.txt]
  - id: list
    title: list
    emoji: 🔹
    run: printf '/users\\n\\n/orders\\n' > "$STAGE_DIR/endpoints.txt"
    outputs: [endpoints.txt]
  - id: check
    title: check
    emoji: 🔹
    each_line: endpoints.txt
    run: echo "checking $ITEM"
  - id: explore
    title: explore
    emoji: 🔹
    when: [staging]
    task: Explore it.
  - id: results
    title: results
    emoji: 🔹
    session: qa
    task: Read results.
    inputs: [explore.md, review.md]
`);
  const dir = join(repo, ".qa");
  mkdirSync(join(repo, "out"));
  const code = await inRepo(repo, () => new Pipeline({ name: file, dir, runTask, outputs: ["gh:pr#7", "out/final.md"], thread: "demo" }).run());
  assert.equal(code, 0);

  const state = readJson(join(dir, "pipeline.json"));
  assert.deepEqual(
    state.stages.map((stage) => [stage.id, stage.status]),
    [["review", "pass"], ["list", "pass"], ["check", "pass"], ["explore", "skipped"], ["results", "pass"], ["summary", "pass"]]
  );
  assert.equal(state.stages[3].reason, "No staging URL.");
  assert.deepEqual(state.stages[2].items.map((item) => item.item), ["/users", "/orders"]);
  assert.match(readFileSync(join(dir, "3-check", "check.log"), "utf8"), /checking \/orders/);
  assert.equal(readFileSync(join(dir, "3-check", "endpoints.txt"), "utf8"), "/users\n\n/orders\n");
  assert.equal(state.stages[1].log, "2-list/list.log");
  assert.ok(existsSync(join(dir, "summary", "summary.md")));

  const calls = calledWith(log);
  const results = calls.find((call) => call.prompt.startsWith("Read results."));
  assert.match(results.prompt, new RegExp(`Read these first: ${join(dir, "5-results", "review.md")}`));
  assert.equal(readFileSync(join(dir, "5-results", "review.md"), "utf8"), readFileSync(join(dir, "1-review", "review.md"), "utf8"));
  assert.match(results.prompt, /Not available: explore.md \(stage explore skipped: No staging URL.\)/);
  assert.ok(results.noThread);
  assert.equal(results.sessionFile, join(dir, ".sessions", "qa.jsonl"));

  const summary = calls.find((call) => call.prompt.startsWith("Write the final report"));
  assert.ok(!summary.noThread);
  assert.match(summary.prompt, new RegExp(`The draft: ${join(dir, "summary", "draft.md")}`));
  assert.ok(results.noDefaultFooter);
  assert.ok(!summary.noDefaultFooter);
  const draft = readFileSync(join(dir, "summary", "draft.md"), "utf8");
  assert.ok(draft.startsWith("### 🔹 review\n\nreport of Review it.\n\n### 🔹 list\n\n`printf"));
  assert.match(draft, /ended pass\. Log: \[2-list\/list\.log\]/);
  assert.match(draft, /### 🔹 explore\n\nSkipped: No staging URL\.\n/);
  assert.ok(!summary.followUp);
  assert.ok(summary.outputs.includes("gh:pr#7"));
  assert.ok(!summary.outputs.includes("out/final.md"));
  assert.equal(calls.filter((call) => call.outputs.includes("gh:pr#7")).length, 1);
  assert.ok(existsSync(join(repo, "out/final.md")));
});

test("each stage works in a numbered folder, reading earlier folders through links", async () => {
  const { repo, runTask } = setup();
  const filler = Array.from({ length: 8 }, (_, index) => `  - id: step-${index}\n    title: step-${index}\n    emoji: 🔹\n    run: "true"\n`).join("");
  const file = write(repo, "pipe.yml", `
stages:
  - id: write
    title: write
    emoji: 🔹
    run: mkdir -p "$STAGE_DIR/cases" && touch "$STAGE_DIR/cases/a.md" "$STAGE_DIR/cases/b.md"
    outputs: [cases/]
  - id: sync
    title: sync
    emoji: 🔹
    each_file: cases/*.md
    run: echo "syncing $ITEM"
${filler}`);
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run()), 0);
  assert.ok(existsSync(join(dir, "01-write", "cases", "a.md")));
  assert.ok(existsSync(join(dir, "10-step-7")));
  const synced = readFileSync(join(dir, "02-sync", "sync.log"), "utf8");
  assert.match(synced, /syncing cases\/a.md/);
  assert.match(synced, /syncing cases\/b.md/);
});

test("changes git cannot read stop the run instead of skipping it", async () => {
  const { repo, runTask } = setup();
  const file = write(repo, "pipe.yml", `
gates:
  big:
    changes: { min_files: 1 }
    message: Too small.
when: [big]
stages:
  - id: one
    title: one
    emoji: 🔹
    run: echo one
`);
  await assert.rejects(
    inRepo(repo, () => new Pipeline({ name: file, dir: join(repo, ".qa"), runTask, sets: { BASE_BRANCH: "nope" } }).run()),
    /fetch-depth: 0/
  );
});

test("the checkout itself is not a pipeline folder", async () => {
  const { repo, runTask } = setup();
  const file = write(repo, "pipe.yml", "stages:\n  - id: one\n    title: one\n    emoji: 🔹\n    run: echo one\n");
  await assert.rejects(inRepo(repo, () => new Pipeline({ name: file, dir: repo, runTask }).run()), /folder of its own/);
});

test("a failed gate in when skips the whole run", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
gates:
  coverage:
    file: [coverage.tests.yml]
    message: No coverage map.
when: [coverage]
stages:
  - id: one
    title: one
    emoji: 🔹
    task: One.
  - id: two
    title: two
    emoji: 🔹
    task: Two.
`);
  const dir = join(repo, ".qa");
  const code = await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run());
  assert.equal(code, 0);
  assert.equal(readJson(join(dir, "pipeline.json")).status, "skipped");
  assert.equal(calledWith(log).length, 0);
});

test("pipeline-check reports every declared gate and runs nothing", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
gates:
  staging:
    env: [CHECK_STAGING_URL]
    message: No staging URL.
  coverage:
    file: [pipe.yml]
    message: No coverage map.
  unused:
    run: "false"
    message: Never used.
stages:
  - id: one
    title: one
    emoji: 🔹
    when: [staging]
    run: echo one
`);
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).check()), 1);
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask, sets: { CHECK_STAGING_URL: "x" }, gates: { pr: "true" } }).check()), 1);
  const fixed = write(repo, "fixed.yml", readFileSync(file, "utf8").replace('"false"', '"true"'));
  assert.equal(await inRepo(repo, () => new Pipeline({ name: fixed, dir, runTask, sets: { CHECK_STAGING_URL: "x" } }).check()), 0);
  assert.equal(existsSync(dir), false);
  assert.equal(calledWith(log).length, 0);
  const broken = write(repo, "broken.yml", "stages:\n  - id: one\n    title: one\n    emoji: 🔹\n    run: echo\n    inputs: [nope.md]\n");
  await assert.rejects(inRepo(repo, () => new Pipeline({ name: broken, dir, runTask }).check()), /reads nope.md/);
});

test("a diagram draws stages, the files they pass on, and gates by result", () => {
  const spec = parse(`
gates:
  staging: { env: [X], message: m }
  map: { file: [a], message: m }
when: [map]
stages:
  - id: review
    title: review
    emoji: 🔹
    task: Review.
    outputs: [plan.md]
  - id: explore
    title: explore
    emoji: 🔹
    when: [staging]
    run: echo
    inputs: [plan.md, seed.txt]
`);
  const stages = [new TaskStage(spec.stages[0]), new CommandStage(spec.stages[1])];
  const chart = new Diagram(spec, stages, new Map([["map", true], ["staging", false], ["ai", true]])).toMermaid();
  assert.match(chart, /s0\("review<br\/>agent"\)/);
  assert.match(chart, /s1\["explore<br\/>command"\]/);
  assert.match(chart, /s0 -\.->\|"plan.md"\| s1/);
  assert.match(chart, /f_1_1\[\("seed.txt"\)\]/);
  assert.match(chart, /s1 --> summary/);
  assert.match(chart, /g0\{\{"map"\}\}\n  class g0 pass\n  g0 --o start/);
  assert.match(chart, /class g1 fail\n  g1 --o s1/);
  assert.match(chart, /g2\{\{"ai"\}\}/);
});

const BASE = `gates:
  pr:
    env: [PR]
    message: No PR.
when: pr
stages:
  - id: plan
    title: Plan
    emoji: 🔹
    task: Plan it.
    when: [pr]
  - id: run
    title: Run
    emoji: 🔹
    run: echo
`;

function overlaid(...overlays) {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-overlay-"));
  return new PipelineFile(write(dir, "base.yml", BASE)).read(overlays);
}

test("an override replaces, appends, prepends and removes", () => {
  const spec = overlaid(
    Overlay.stage("plan:append_task: Never assume credentials."),
    Overlay.stage("plan:{prepend_task: Read the issue first., append_when: staging, timeout: 30m}"),
    Overlay.stage("run:run: echo changed"),
    Overlay.pipeline("{gates: {staging: {env: [URL], message: No URL.}}, remove_when: pr, append_summary: Be brief.}"),
  );
  const plan = spec.stages[0];
  assert.equal(plan.task, "Read the issue first.\nPlan it.\nNever assume credentials.");
  assert.deepEqual(plan.when, ["pr", "staging"]);
  assert.equal(plan.timeout, "30m");
  assert.equal(spec.stages[1].run, "echo changed");
  assert.deepEqual(spec.when, []);
  assert.equal(spec.summary, "Be brief.");
  assert.deepEqual(spec.gates.pr, { env: ["PR"], message: "No PR." });
  assert.deepEqual(spec.gates.staging, { env: ["URL"], message: "No URL." });
});

test("an override can add and remove stages and gates", () => {
  const added = overlaid(Overlay.pipeline("stages: [{id: extra, title: Extra, emoji: 🔸, run: echo extra}]"));
  assert.deepEqual(added.stages.map((stage) => stage.id), ["plan", "run", "extra"]);
  const removed = overlaid(Overlay.pipeline("{remove_stages: [plan], remove_gates: [pr], remove_when: [pr]}"));
  assert.deepEqual(removed.stages.map((stage) => stage.id), ["run"]);
  assert.deepEqual(Object.keys(removed.gates), []);
});

test("a wrong override is bad usage, found before anything runs", () => {
  assert.throws(() => overlaid(Overlay.stage("nope:append_task: x")), /--stage nope: there is no stage "nope" to change/);
  assert.throws(() => overlaid(Overlay.stage("plan:append_timeout: 30m")), /append_timeout is not allowed/);
  assert.throws(() => overlaid(Overlay.stage("plan:remove_task: x")), /remove_task is not allowed/);
  assert.throws(() => overlaid(Overlay.stage("plan:apend_task: x")), /unknown key "apend_task"/);
  assert.throws(() => overlaid(Overlay.stage("run:append_task: x")), /exactly one of task or run/);
  assert.throws(() => overlaid(Overlay.stage("plan:append_when: staging")), /names gate "staging"/);
  assert.throws(() => overlaid(Overlay.pipeline("remove_stages: [nope]")), /no stage "nope" to remove/);
  assert.throws(() => Overlay.stage("plan"), /--stage takes ID:YAML/);
  assert.throws(() => Overlay.stage("plan:just text"), /--stage plan takes YAML keys/);
});

test("a file can extend a bundled pipeline or a path, keeping only its changes", () => {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-extends-"));
  write(dir, "base.yml", BASE);
  const child = write(dir, "child.yml", "extends: ./base.yml\nname: child\nstages:\n  - id: plan\n    append_task: Be brief.\n");
  const spec = new PipelineFile(child).read();
  assert.equal(spec.name, "child");
  assert.equal(spec.stages[0].task, "Plan it.\nBe brief.");
  const bundled = new PipelineFile(write(dir, "issue.yml", "extends: issue-test-cases\nstages:\n  - id: requirements\n    append_task: Never assume credentials.\n")).read();
  assert.equal(bundled.name, "issue-test-cases");
  assert.match(bundled.stages[0].task, /\nNever assume credentials\.$/);
  write(dir, "loop.yml", "extends: ./loop.yml\nstages: []\n");
  assert.throws(() => new PipelineFile(join(dir, "loop.yml")).read(), /loops back to itself/);
});

test("a run keeps the pipeline with its overrides, so a retry repeats it", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", "stages:\n  - id: one\n    title: one\n    emoji: 🔹\n    task: One.\n");
  const dir = join(repo, ".qa");
  const options = { name: file, dir, runTask, stageOverrides: ["one:append_task: Be brief."] };
  await inRepo(repo, () => new Pipeline(options).run());
  assert.match(calledWith(log)[0].prompt, /^One\.\nBe brief\./);
  assert.equal(new PipelineFile(file).parse(readFileSync(join(dir, "pipeline.yml"), "utf8")).stages[0].task, "One.\nBe brief.");
});

test("a --gate from the job skips the run before outputs are checked", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", "stages:\n  - id: one\n    title: one\n    emoji: 🔹\n    task: One.\n");
  const dir = join(repo, ".qa");
  const options = { name: file, dir, runTask, outputs: ["gh:pr#"], gates: { pr: "test -n \"$PR\"" } };
  assert.equal(await inRepo(repo, () => new Pipeline(options).run()), 0);
  assert.equal(readJson(join(dir, "pipeline.json")).status, "skipped");
  assert.equal(calledWith(log).length, 0);
  await assert.rejects(inRepo(repo, () => new Pipeline({ ...options, sets: { PR: "1" } }).run()), /gh:pr#/);
  const gated = write(repo, "gated.yml", "gates:\n  pr:\n    env: [PR]\n    message: No PR.\nstages:\n  - id: one\n    title: one\n    emoji: 🔹\n    when: [pr]\n    task: One.\n");
  await assert.rejects(inRepo(repo, () => new Pipeline({ name: gated, dir, runTask, gates: { pr: "true" } }).run()), /already defines/);
});

test("stopOn fail stops the stages after it, the summary still runs", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    title: one
    emoji: 🔹
    task: FAIL on purpose.
    stopOn: fail
  - id: two
    title: two
    emoji: 🔹
    task: Two.
`);
  const dir = join(repo, ".qa");
  const code = await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run());
  assert.equal(code, 1);
  const state = readJson(join(dir, "pipeline.json"));
  assert.deepEqual(state.stages.map((stage) => stage.status), ["fail", "not-run", "pass"]);
  assert.equal(calledWith(log).length, 2);
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir: join(repo, ".qb"), runTask, exitZero: true }).run()), 0);
});

test("a timed-out round retries from the stage that stopped", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    title: one
    emoji: 🔹
    session: qa
    task: One.
  - id: two
    title: two
    emoji: 🔹
    session: qa
    task: SLOW two.
    timeout: 1s
  - id: three
    title: three
    emoji: 🔹
    task: Three.
`);
  const dir = join(repo, ".qa");
  process.env.FAKE_SLOW = "1";
  const first = await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run());
  delete process.env.FAKE_SLOW;
  assert.equal(first, 1);
  const stopped = readJson(join(dir, "pipeline.json"));
  assert.deepEqual(stopped.stages.map((stage) => stage.status), ["pass", "timeout", "not-run", "pass"]);

  rmSync(log);
  const second = await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run());
  assert.equal(second, 0);
  const calls = calledWith(log);
  assert.deepEqual(calls.map((call) => call.prompt.split("\n")[0]), ["SLOW two.", "Three.", 'Write the final report of the "pipe" pipeline, round 1.']);
  assert.ok(calls[0].followUp);
  assert.equal(readJson(join(dir, "pipeline.json")).round, 1);
});

test("a new commit starts a new round that updates the last one", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    title: one
    emoji: 🔹
    run: cp "$PIPELINE_DIR/changes.txt" "$STAGE_DIR/seen.txt"
    outputs: [seen.txt]
  - id: two
    title: two
    emoji: 🔹
    task: Two.
`);
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "pipeline");
  const dir = join(repo, ".qa");
  await inRepo(repo, () => new Pipeline({ name: file, dir, runTask, sets: { BASE_BRANCH: "main" } }).run());
  const firstCommit = git(repo, "rev-parse", "HEAD");

  commit(repo, "src/new.ts");
  await inRepo(repo, () => new Pipeline({ name: file, dir, runTask, sets: { BASE_BRANCH: "main" } }).run());
  const state = readJson(join(dir, "pipeline.json"));
  assert.equal(state.round, 2);
  assert.equal(state.since, firstCommit);
  assert.equal(readFileSync(join(dir, "1-one", "seen.txt"), "utf8").trim(), "src/new.ts");
  assert.deepEqual(state.rounds.map((entry) => entry.round), [1, 2]);
  assert.ok(existsSync(join(dir, ".last", "1-one", "seen.txt")));
  assert.ok(existsSync(join(dir, ".last", "summary", "summary.md")));

  const tasks = calledWith(log).map((call) => call.prompt).filter((task) => task.startsWith("Two."));
  assert.doesNotMatch(tasks[0], /Last round/);
  assert.match(tasks[1], new RegExp(`Last round: ${join(dir, ".last", "2-two")}\\..*Changed files: ${join(dir, "changes.txt")}`));
});

function setup() {
  const repo = gitRepo();
  const cli = write(repo, "fake-cli.mjs", FAKE);
  const log = join(repo, "calls.log");
  process.env.FAKE_LOG = log;
  writeFileSync(join(repo, ".gitignore"), ".qa/\n.qb/\ncalls.log\nout/\n");
  return { repo, log, cli, runTask: fakeTask(log) };
}

async function inRepo(repo, fn) {
  const before = process.cwd();
  process.chdir(repo);
  try {
    return await fn();
  } finally {
    process.chdir(before);
  }
}

function gitRepo() {
  const repo = mkdtempSync(join(tmpdir(), "testeiya-pipeline-test-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "test");
  commit(repo, "README.md");
  return repo;
}

function commit(repo, file) {
  mkdirSync(join(repo, file, ".."), { recursive: true });
  writeFileSync(join(repo, file), `${file}\n`);
  git(repo, "add", file);
  git(repo, "commit", "-qm", file);
}

function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function write(repo, name, text) {
  const path = join(repo, name);
  writeFileSync(path, text);
  return path;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function calledWith(log) {
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("the summary draft keeps each stage report word for word, its headings under the section", () => {
  const dir = mkdtempSync(join(tmpdir(), "summary-"));
  mkdirSync(join(dir, "1-req"));
  writeFileSync(join(dir, "1-req", "req.md"), "## Breakdown\n\n- one\n\n```\n# not a heading\n```\n\n### Risks\n\n1. two\n");
  const spec = (id, extra) => ({ id, title: id, emoji: "🔹", inputs: [], outputs: [], when: [], stopOn: [], ...extra });
  const stages = [new TaskStage(spec("req", { task: "Req." }), "1-req"), new TaskStage(spec("cases", { task: "Cases." }), "2-cases")];
  const records = { req: { id: "req", status: "pass", report: "1-req/req.md" }, cases: { id: "cases", status: "skipped", reason: "No tests." } };
  const state = { record: { round: 1, status: "pass" }, stage: (id) => records[id] };
  const summary = new SummaryStage({ name: "p" }, stages, state, dir);
  assert.equal(
    summary.draft(dir),
    "### 🔹 req\n\n#### Breakdown\n\n- one\n\n```\n# not a heading\n```\n\n##### Risks\n\n1. two\n\n### 🔹 cases\n\nSkipped: No tests.\n"
  );
});

test("a variable can run Liquid filters and ours for URLs", () => {
  const vars = new Variables({ URL: "https://staging.example.com/users/Settings", NAME: " qa " });
  assert.equal(vars.expand("${URL | host}"), "staging.example.com");
  assert.equal(vars.expand("${URL | path | slugify}"), "users-settings");
  assert.equal(vars.expand("${NAME | strip | capitalize}"), "Qa");
  assert.equal(vars.expand('${MISSING | default: "none"}'), "none");
  assert.equal(vars.expand("${MISSING | host}"), "");
  assert.equal(vars.expand("${URL:-x} ${MISSING:-x}"), "https://staging.example.com/users/Settings x");
  const env = vars.withExpanded({ SITE: "${URL | host}", PAGE: "${URL | path | slugify}", KEY: "${SITE}-${PAGE}" });
  assert.equal(env.get("KEY"), "staging.example.com-users-settings");
});

test("an unknown filter, or a filter in a shell command, is bad usage", () => {
  const stage = "stages:\n  - id: a\n    title: a\n    emoji: 🔹\n";
  assert.throws(() => parse(`env:\n  SITE: \${URL | nope}\n${stage}    run: echo\n`), /env.SITE: \$\{URL \| nope\}: undefined filter: nope/);
  assert.throws(() => parse(`${stage}    task: Check \${URL | hots}\n`), /stage "a" task: .*undefined filter: hots/);
  assert.throws(() => parse(`${stage}    run: echo \${URL | host}\n`), /a shell command cannot use filters/);
  assert.equal(parse(`env:\n  SITE: \${URL | host}\n${stage}    run: echo "$SITE"\n`).env.SITE, "${URL | host}");
});

const twoStages = (first) => `
stages:
  - id: one
    title: one
    emoji: 🔹
    task: ${first}
    timeout: 1s
  - id: two
    title: two
    emoji: 🔹
    task: Two.
`;

test("a stuck stage times out after the grace period and the next stage never runs", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", twoStages("STUCK one."));
  const dir = join(repo, ".qa");
  const started = Date.now();
  const code = await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run());
  assert.equal(code, 1);
  assert.ok(Date.now() - started < 1000 + KILL_GRACE_MS + 2000);
  const state = readJson(join(dir, "pipeline.json"));
  assert.deepEqual(state.stages.map((stage) => stage.status), ["timeout", "not-run", "pass"]);
  assert.ok(!calledWith(log).some((call) => call.prompt.startsWith("Two.")));
});

test("Ctrl-C aborts the running task and stops the pipeline", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", twoStages("INT one."));
  const dir = join(repo, ".qa");
  const code = await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run());
  assert.notEqual(code, 0);
  const state = readJson(join(dir, "pipeline.json"));
  assert.equal(state.status, "interrupted");
  assert.equal(state.stages[0].status, "interrupted");
  assert.equal(calledWith(log).length, 1);
});

test("each loop item runs in its own env, and the parent keeps none of it", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: list
    title: list
    emoji: 🔹
    run: printf 'a\\nb\\n' > "$STAGE_DIR/items.txt"
    outputs: [items.txt]
  - id: each
    title: each
    emoji: 🔹
    each_line: items.txt
    task: Check it.
`);
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run()), 0);
  const items = calledWith(log).filter((call) => call.prompt.startsWith("Check it."));
  assert.deepEqual(items.map((call) => call.env.ITEM), ["a", "b"]);
  assert.ok(items.every((call) => call.env.STAGE_DIR.endsWith("2-each")));
  assert.equal(process.env.STAGE_DIR, undefined);
  assert.equal(process.env.ITEM, undefined);
});

test("bad usage in a stage is broken, with the reason", async () => {
  const { repo, runTask } = setup();
  const file = write(repo, "pipe.yml", twoStages("BADMODEL one."));
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run()), 1);
  const [stage] = readJson(join(dir, "pipeline.json")).stages;
  assert.equal(stage.status, "broken");
  assert.equal(stage.reason, "bad usage: no such model");
});

test("TESTEIYA_PIPELINE_SPAWN=1 still spawns the CLI", async () => {
  const { repo, log, cli } = setup();
  const file = write(repo, "pipe.yml", "stages:\n  - id: one\n    title: one\n    emoji: 🔹\n    task: One.\n");
  process.env.TESTEIYA_PIPELINE_SPAWN = "1";
  const code = await inRepo(repo, () => new Pipeline({ name: file, dir: join(repo, ".qa"), cli }).run());
  delete process.env.TESTEIYA_PIPELINE_SPAWN;
  assert.equal(code, 0);
  const calls = calledWith(log);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].at(-1).startsWith("One."));
});

// Emitting the events would also reach node:test's own listeners, so the test calls the guard's directly.
test("an armed guard takes uncaught errors and rejections, a disarmed one lets go", () => {
  const seen = [];
  const guard = new CrashGuard((err) => seen.push(err.message));
  const before = ["uncaughtException", "unhandledRejection"].map((event) => process.listenerCount(event));
  guard.arm();
  process.listeners("uncaughtException").at(-1)(new Error("boom"));
  process.listeners("unhandledRejection").at(-1)(new Error("ext"), Promise.resolve());
  guard.disarm();
  assert.deepEqual(seen, ["boom", "ext"]);
  assert.deepEqual(["uncaughtException", "unhandledRejection"].map((event) => process.listenerCount(event)), before);
});

test("a task left behind keeps the crash guard until it settles", async () => {
  const { repo, runTask } = setup();
  const file = write(repo, "pipe.yml", twoStages("LATE one."));
  const before = process.listenerCount("uncaughtException");
  await inRepo(repo, () => new Pipeline({ name: file, dir: join(repo, ".qa"), runTask }).run());
  assert.equal(process.listenerCount("uncaughtException"), before + 1);
  await new Promise((done) => setTimeout(done, 3000));
  assert.equal(process.listenerCount("uncaughtException"), before);
});
