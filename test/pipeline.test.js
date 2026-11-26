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
import { ChangesMarker } from "../dist/src/pipeline/markers.js";
import { Override } from "../dist/src/pipeline/override.js";
import { Packages } from "../dist/src/pipeline/packages.js";
import { PipelineFile } from "../dist/src/pipeline/pipeline-file.js";
import { CommandStage } from "../dist/src/pipeline/command-stage.js";
import { Duration } from "../dist/src/pipeline/duration.js";
import { StageEnv } from "../dist/src/pipeline/stage-env.js";
import { CrashGuard } from "../dist/src/pipeline/crash-guard.js";
import { SummaryStage } from "../dist/src/pipeline/summary-stage.js";
import { TaskStage } from "../dist/src/pipeline/task-stage.js";
import { KILL_GRACE_MS } from "../dist/src/pipeline/launcher.js";
import { Variables } from "../dist/src/pipeline/variables.js";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { UsageError } from "../dist/src/model.js";

// A pull request run in CI names its own branches; the tests name theirs.
for (const name of Object.keys(process.env)) {
  if (name.startsWith("GITHUB_") || name.startsWith("CI_MERGE_REQUEST_") || name.startsWith("BITBUCKET_")) delete process.env[name];
}

const parse = (text) => new PipelineFile("p.yml").parse(text).spec;

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
  assert.throws(() => parse("target: [pr]\nstages:\n  - id: a\n    run!sh: echo\n"), /target must be text/);
});

test("a stage naming an undefined gate is bad usage", () => {
  const text = "stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    run!sh: echo\n    when!: prerequisites.staging\n";
  assert.throws(() => parse(text), /unknown name "prerequisites"/);
});

test("the old gates key points at prerequisites", () => {
  const text = "gates:\n  pr:\n    $value!: vars.PR != null\n    message: No PR.\nstages:\n  - id: a\n    run!sh: echo\n";
  assert.throws(() => parse(text), /gates is now called prerequisites/);
});

test("a stage runs one thing, said by the marker of run", () => {
  assert.throws(() => parse("stages:\n  - id: a\n    title: a\n    emoji: 🔹\n"), /missing required field "run"/);
  const both = "stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    run!sh: echo\n    run!task: hi\n";
  assert.throws(() => parse(both), /"run!sh" and "run!task" are the same key "run"/);
  assert.throws(() => parse("stages:\n  - id: a\n    run!file: x\n"), /runs something: run!task: <task>, run!sh: <command>/);
  for (const [old, now] of [["task: hi", "run!task: <task>"], ["decide: ok?", "run!decide: { question, context, threshold }"], ["extract: x", "run!extract: { what, values: { name: what it is } }"]]) {
    assert.throws(() => parse(`stages:\n  - id: a\n    ${old}\n`), new RegExp(`${old.split(":")[0]} is now ${now.replace(/[{}!?<>]/g, "\\$&")}`));
  }
});

test("a stage without a title or an emoji gets them from its id", () => {
  const [stage] = parse("stages:\n  - id: browser-testing\n    run!sh: echo\n").stages;
  assert.equal(stage.title, "Browser testing");
  assert.ok(stage.emoji);
  assert.equal(parse("stages:\n  - id: browser-testing\n    run!sh: echo\n").stages[0].emoji, stage.emoji);
});

test("reserved ids, unknown keys and stray stopOn are rejected", () => {
  assert.throws(() => parse("stages:\n  - id: summary\n    title: summary\n    emoji: 🔹\n    run!sh: echo\n"), /reserved/);
  assert.throws(() => parse("stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    run!sh: echo\n    model: x\n"), /"model" is not a field of the schema/);
  assert.throws(() => parse("stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    run!sh: echo\n    stopOn: always\n"), /stopOn/);
});

test("an output may not reuse the stage's own file name, nor one of its inputs", async () => {
  const { repo, runTask } = setup();
  const check = (text) => inRepo(repo, () => new Pipeline({ name: write(repo, "pipe.yml", text), dir: join(repo, ".qa"), runTask, dryRun: true }).run());
  await assert.rejects(check("stages:\n  - id: plan\n    title: plan\n    emoji: 🔹\n    run!task: hi\n    outputs: [plan.md]\n"), /plan.md is a file the stage writes itself/);
  const edits = "stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    run!task: hi\n    outputs: [x.md]\n  - id: b\n    title: b\n    emoji: 🔹\n    run!task: hi\n    inputs: [x.md]\n    outputs: [x.md]\n";
  await assert.rejects(check(edits), /reads and writes x.md/);
});

test("durations read seconds, minutes and hours", () => {
  assert.equal(Duration.ms("90s"), 90_000);
  assert.equal(Duration.ms("30m"), 1_800_000);
  assert.equal(Duration.ms("1h"), 3_600_000);
  assert.equal(Duration.ms(5), 5_000);
  assert.equal(Duration.ms("soon"), null);
});

test("a task fills in {{ }} with the run's variables; unset is empty", () => {
  const definition = new PipelineFile("p.yml").parse("stages:\n  - id: a\n    run!task: Open {{ vars.URL }}/x [{{ vars.MISSING }}]\n");
  assert.equal(definition.values({ URL: "https://a", MISSING: "" }).task("a"), "Open https://a/x []");
});

test("a changes check counts what is not ignored", async () => {
  const files = ["src/api/users.ts", "README.md", "docs/a.md"];
  const passes = (changes, filesChanged = files) =>
    new Gate("g", "m", new ChangesMarker(changes), { changes }).passes({ cwd: ".", vars: new Variables({}), changes: { files: filesChanged, from: "x" }, values: () => null });
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
  TESTOMATIO_BRANCH!: slug(vars.GIT_BRANCH)
stages:
  - id: branch
    title: branch
    emoji: 🔹
    run!sh: printf '%s\\n' "$GIT_BRANCH" "$TESTOMATIO_BRANCH"
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
prerequisites:
  staging:
    $value!: vars.DEMO_STAGING_URL != null
    message: No staging URL.
stages:
  - id: review
    title: review
    emoji: 🔹
    session: qa
    run!task: Review it.
    outputs: [endpoints.txt]
  - id: list
    title: list
    emoji: 🔹
    run!sh: printf '/users\\n\\n/orders\\n' > "$STAGE_DIR/endpoints.txt"
    outputs: [endpoints.txt]
  - id: check
    title: check
    emoji: 🔹
    each_line: endpoints.txt
    run!sh: echo "checking $ITEM"
  - id: explore
    title: explore
    emoji: 🔹
    when!: prerequisites.staging
    run!task: Explore it.
  - id: results
    title: results
    emoji: 🔹
    session: qa
    run!task: Read results.
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
  const filler = Array.from({ length: 8 }, (_, index) => `  - id: step-${index}\n    title: step-${index}\n    emoji: 🔹\n    run!sh: "true"\n`).join("");
  const file = write(repo, "pipe.yml", `
stages:
  - id: write
    title: write
    emoji: 🔹
    run!sh: mkdir -p "$STAGE_DIR/cases" && touch "$STAGE_DIR/cases/a.md" "$STAGE_DIR/cases/b.md"
    outputs: [cases/]
  - id: sync
    title: sync
    emoji: 🔹
    each_file: cases/*.md
    run!sh: echo "syncing $ITEM"
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
prerequisites:
  big:
    $value!changes: { min_files: 1 }
    message: Too small.
when!: prerequisites.big
stages:
  - id: one
    title: one
    emoji: 🔹
    run!sh: echo one
`);
  await assert.rejects(
    inRepo(repo, () => new Pipeline({ name: file, dir: join(repo, ".qa"), runTask, sets: { BASE_BRANCH: "nope" } }).run()),
    /fetch-depth: 0/
  );
});

test("the checkout itself is not a pipeline folder", async () => {
  const { repo, runTask } = setup();
  const file = write(repo, "pipe.yml", "stages:\n  - id: one\n    title: one\n    emoji: 🔹\n    run!sh: echo one\n");
  await assert.rejects(inRepo(repo, () => new Pipeline({ name: file, dir: repo, runTask }).run()), /folder of its own/);
});

test("a failed gate in when skips the whole run", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
prerequisites:
  coverage:
    $value!file: [coverage.tests.yml]
    message: No coverage map.
when!: prerequisites.coverage
stages:
  - id: one
    title: one
    emoji: 🔹
    run!task: One.
  - id: two
    title: two
    emoji: 🔹
    run!task: Two.
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
prerequisites:
  staging:
    $value!: vars.CHECK_STAGING_URL != null
    message: No staging URL.
  coverage:
    $value!file: [pipe.yml]
    message: No coverage map.
  unused:
    $value!sh: "false"
    message: Never used.
stages:
  - id: one
    title: one
    emoji: 🔹
    when!: prerequisites.staging
    run!sh: echo one
`);
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).check()), 1);
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask, sets: { CHECK_STAGING_URL: "x" }, gates: { pr: "true" } }).check()), 1);
  const fixed = write(repo, "fixed.yml", readFileSync(file, "utf8").replace('"false"', '"true"'));
  assert.equal(await inRepo(repo, () => new Pipeline({ name: fixed, dir, runTask, sets: { CHECK_STAGING_URL: "x" } }).check()), 0);
  assert.equal(existsSync(dir), false);
  assert.equal(calledWith(log).length, 0);
  const broken = write(repo, "broken.yml", "stages:\n  - id: one\n    title: one\n    emoji: 🔹\n    run!sh: echo\n    inputs: [nope.md]\n");
  await assert.rejects(inRepo(repo, () => new Pipeline({ name: broken, dir, runTask }).check()), /reads nope.md/);
});

test("a diagram draws stages, the files they pass on, and gates by result", () => {
  const spec = parse(`
prerequisites:
  staging: { $value!: vars.X != null, message: m }
  map: { $value!file: [a], message: m }
when!: prerequisites.map
stages:
  - id: review
    title: review
    emoji: 🔹
    run!task: Review.
    outputs: [plan.md]
  - id: explore
    title: explore
    emoji: 🔹
    when!: prerequisites.staging
    run!sh: echo
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

const BASE = `prerequisites:
  pr:
    $value!: vars.PR != null
    message: No PR.
when!: prerequisites.pr
stages:
  - id: plan
    title: Plan
    emoji: 🔹
    run!task: Plan it.
    when!: prerequisites.pr
  - id: run
    title: Run
    emoji: 🔹
    run!sh: echo
`;

function overridden(...overrides) {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-override-"));
  return new PipelineFile(write(dir, "base.yml", BASE)).read(overrides);
}

test("an override replaces, adds before and after, and removes", () => {
  // As the runner orders them: every --pipeline, then every --stage.
  const spec = overridden(
    Override.pipeline("{prerequisites: {$add: {staging: {$value!: vars.URL != null, message: No URL.}}}, $remove: [when], $add: {summary: Be brief.}}"),
    Override.stage("plan:$replace: { run!task: Plan it. Never assume credentials. }"),
    Override.stage("plan:{$replace: { when!: base and prerequisites.staging }, $add: { timeout: 30m }}"),
    Override.stage("run:$replace: { run!sh: echo changed }"),
  );
  const plan = spec.stages[0];
  assert.equal(plan.task, "Plan it. Never assume credentials.");
  assert.deepEqual(plan.when, ["pr", "staging"]);
  assert.equal(plan.condition, "(prerequisites.pr) and prerequisites.staging");
  assert.equal(plan.timeout, "30m");
  assert.equal(spec.stages[1].run, "echo changed");
  assert.deepEqual(spec.when, []);
  assert.equal(spec.summary, "Be brief.");
  assert.deepEqual(spec.prerequisites.pr, { formula: "vars.PR != null", message: "No PR.", env: ["PR"], needs: [], secret: false });
  assert.deepEqual(spec.prerequisites.staging.env, ["URL"]);
});

test("an override can add and remove stages and prerequisites", () => {
  const added = overridden(Override.pipeline("stages: { $after: { extra: { title: Extra, emoji: 🔸, run!sh: echo extra } } }"));
  assert.deepEqual(added.stages.map((stage) => stage.id), ["plan", "run", "extra"]);
  const first = overridden(Override.pipeline("stages: { $before: { lint: { run!sh: npm run lint } } }"));
  assert.deepEqual(first.stages.map((stage) => stage.id), ["lint", "plan", "run"]);
  const removed = overridden(Override.pipeline("{stages: {$remove: [plan]}, prerequisites: {$remove: [pr]}, $remove: [when]}"));
  assert.deepEqual(removed.stages.map((stage) => stage.id), ["run"]);
  assert.deepEqual(Object.keys(removed.prerequisites), []);
});

test("a wrong override is bad usage, found before anything runs", () => {
  assert.throws(() => overridden(Override.stage("nope:$replace: { title: x }")), /--stage nope: stages.nope: "nope" matches nothing in the base/);
  assert.throws(() => overridden(Override.stage("plan:title: Planning")), /--stage plan: .*a plain field in a patch does not overwrite/);
  assert.throws(() => overridden(Override.stage("plan:$replace: { model: x }")), /"model" does not exist in the base/);
  assert.throws(() => overridden(Override.stage("plan:append_task: x")), /--stage plan: append_task is now \$after/);
  assert.throws(() => overridden(Override.stage("run:$add: { run!task: x }")), /"run" already exists in the base/);
  assert.throws(() => overridden(Override.stage("plan:run!task: { $after: x }")), /a plain field in a patch does not overwrite; write \$replace: \{ run!task: … \}/);
  assert.throws(() => overridden(Override.stage("plan:$replace: { when!: prerequisites.staging }")), /there is no key "staging" in "prerequisites"/);
  assert.throws(() => overridden(Override.pipeline("stages: { $remove: [nope] }")), /"nope" does not exist in the base, so it cannot be removed/);
  assert.throws(() => Override.stage("plan"), /--stage takes ID:YAML/);
  assert.throws(() => Override.stage("plan:just text"), /--stage plan takes a YAML patch/);
  assert.deepEqual(Override.stage("plan:{$replace: { run!task: x, timeout: 1m }}").keys(), ["$replace.run!task", "$replace.timeout"]);
});

test("a file can extend a bundled pipeline or a path, keeping only its changes", () => {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-extends-"));
  write(dir, "base.yml", BASE);
  const child = write(dir, "child.yml", "$extends: ./base.yml\n$add:\n  name: child\nstages:\n  plan:\n    $replace:\n      run!task: Plan it. Be brief.\n");
  const spec = new PipelineFile(child).read();
  assert.equal(spec.name, "child");
  assert.equal(spec.stages[0].task, "Plan it. Be brief.");
  const bundled = new PipelineFile(write(dir, "issue.yml", "$extends: issue-test-cases\nstages:\n  requirements:\n    $replace:\n      run!task: Never assume credentials.\n")).read();
  assert.equal(bundled.name, "issue-test-cases");
  assert.equal(bundled.stages[0].task, "Never assume credentials.");
  // A file called like a bundled pipeline extends the bundled one.
  const own = new PipelineFile(write(dir, "regression.yml", "$extends: regression\n$replace:\n  description: Ours.\n")).read();
  assert.equal(own.description, "Ours.");
  write(dir, "loop.yml", "$extends: ./loop.yml\n");
  assert.throws(() => new PipelineFile(join(dir, "loop.yml")).read(), /extends itself/);
  assert.throws(() => new PipelineFile(write(dir, "old.yml", "extends: regression\n")).read(), /old.yml: extends is now \$extends/);
});

test("a run keeps the pipeline with its overrides, so a retry repeats it", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", "stages:\n  - id: one\n    title: one\n    emoji: 🔹\n    run!task: One.\n");
  const dir = join(repo, ".qa");
  const options = { name: file, dir, runTask, stageOverrides: ["one:$replace: { run!task: One. Be brief. }"] };
  await inRepo(repo, () => new Pipeline(options).run());
  assert.match(calledWith(log)[0].prompt, /^One\. Be brief\./);
  assert.equal(new PipelineFile(file).parse(readFileSync(join(dir, "pipeline.yml"), "utf8")).spec.stages[0].task, "One. Be brief.");
});

test("a --gate from the job skips the run before outputs are checked", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", "stages:\n  - id: one\n    title: one\n    emoji: 🔹\n    run!task: One.\n");
  const dir = join(repo, ".qa");
  const options = { name: file, dir, runTask, outputs: ["gh:pr#"], gates: { pr: "test -n \"$PR\"" } };
  assert.equal(await inRepo(repo, () => new Pipeline(options).run()), 0);
  assert.equal(readJson(join(dir, "pipeline.json")).status, "skipped");
  assert.equal(calledWith(log).length, 0);
  await assert.rejects(inRepo(repo, () => new Pipeline({ ...options, sets: { PR: "1" } }).run()), /gh:pr#/);
  const gated = write(repo, "gated.yml", "prerequisites:\n  pr:\n    $value!: vars.PR != null\n    message: No PR.\nstages:\n  - id: one\n    title: one\n    emoji: 🔹\n    when!: prerequisites.pr\n    run!task: One.\n");
  await assert.rejects(inRepo(repo, () => new Pipeline({ name: gated, dir, runTask, gates: { pr: "true" } }).run()), /already defines/);
});

test("a failed stage stops the stages after it, the summary still runs", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    title: one
    emoji: 🔹
    run!task: FAIL on purpose.
  - id: two
    title: two
    emoji: 🔹
    run!task: Two.
`);
  const dir = join(repo, ".qa");
  const code = await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run());
  assert.equal(code, 1);
  const state = readJson(join(dir, "pipeline.json"));
  assert.deepEqual(state.stages.map((stage) => stage.status), ["fail", "not-run", "pass"]);
  assert.equal(calledWith(log).length, 2);
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir: join(repo, ".qb"), runTask, exitZero: true }).run()), 0);
});

test("continueOn fail runs the stages after a failed stage, and the run still fails", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    title: one
    emoji: 🔹
    run!task: FAIL on purpose.
    continueOn: fail
  - id: two
    title: two
    emoji: 🔹
    run!task: Two.
`);
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run()), 1);
  const state = readJson(join(dir, "pipeline.json"));
  assert.deepEqual(state.stages.map((stage) => stage.status), ["fail", "pass", "pass"]);
  assert.equal(state.status, "fail");
  assert.equal(calledWith(log).length, 3);
});

test("an optional stage that fails neither stops the pipeline nor fails the run", async () => {
  const { repo, runTask } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    title: one
    emoji: 🔹
    run!task: One.
  - id: sync
    title: sync
    emoji: 🔹
    run!task: FAIL on purpose.
    optional: true
  - id: three
    title: three
    emoji: 🔹
    run!sh: exit 1
    optional: true
  - id: four
    title: four
    emoji: 🔹
    run!task: Four.
`);
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run()), 0);
  const state = readJson(join(dir, "pipeline.json"));
  assert.deepEqual(state.stages.map((stage) => stage.status), ["pass", "fail", "fail", "pass", "pass"]);
  assert.deepEqual(state.stages.map((stage) => stage.optional ?? false), [false, true, true, false, false]);
  assert.equal(state.status, "pass");
});

test("a failed stage before an optional one still stops the run", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    title: one
    emoji: 🔹
    run!task: FAIL on purpose.
  - id: sync
    title: sync
    emoji: 🔹
    run!task: Sync.
    optional: true
`);
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run()), 1);
  assert.deepEqual(readJson(join(dir, "pipeline.json")).stages.map((stage) => stage.status), ["fail", "not-run", "pass"]);
  assert.equal(calledWith(log).length, 2);
});

test("stopOn holds fail unless the stage is optional or goes on", () => {
  const stage = (extra) => parse(`stages:\n  - id: a\n    title: a\n    emoji: 🔹\n    run!sh: echo\n${extra}`).stages[0];
  assert.deepEqual(stage("").stopOn, ["fail"]);
  assert.deepEqual(stage("    stopOn: [gate]\n").stopOn, ["fail", "gate"]);
  assert.deepEqual(stage("    continueOn: fail\n").stopOn, []);
  assert.deepEqual(stage("    optional: true\n    stopOn: [gate]\n").stopOn, ["gate"]);
  assert.equal(stage("    optional: true\n").optional, true);
  assert.throws(() => stage("    optional: yes please\n"), /optional must be true or false/);
  assert.throws(() => stage("    continueOn: gate\n"), /"gate" is not one of: fail/);
  assert.throws(() => stage("    continueOn: fail\n    stopOn: [fail]\n"), /cannot both stop and go on/);
});

test("a timed-out round retries from the stage that stopped", async () => {
  const { repo, log, runTask } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    title: one
    emoji: 🔹
    session: qa
    run!task: One.
  - id: two
    title: two
    emoji: 🔹
    session: qa
    run!task: SLOW two.
    timeout: 1s
  - id: three
    title: three
    emoji: 🔹
    run!task: Three.
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
    run!sh: cp "$PIPELINE_DIR/changes.txt" "$STAGE_DIR/seen.txt"
    outputs: [seen.txt]
  - id: two
    title: two
    emoji: 🔹
    run!task: Two.
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

test("package versions are formulas, and an empty one or a leading @ means a tag", () => {
  const packages = new Packages({ two: "@next", three: "", four: "file:../four" });
  assert.deepEqual(packages.specs(), ["two@next", "three@latest", "four@file:../four"]);
  const definition = new PipelineFile("p.yml").parse("$vars:\n  ONE_VERSION: { default: latest }\npackages:\n  one!: vars.ONE_VERSION\nstages:\n  - id: a\n    run!sh: echo\n");
  assert.deepEqual(definition.values({ ONE_VERSION: "1.2.3" }).packages(), { one: "1.2.3" });
  assert.deepEqual(definition.values({}).packages(), { one: "latest" });
});

test("packages must be a mapping of name to version", () => {
  assert.throws(() => parse("packages: [explorbot]\nstages:\n  - id: one\n    run!sh: echo\n"), /packages must be a mapping/);
});

test("a stage runs a package's binary through npx or by name, never the registry", async () => {
  const { repo, runTask } = setup();
  const pkg = mkdtempSync(join(tmpdir(), "testeiya-package-"));
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "fake-tool", version: "1.0.0", bin: { "fake-tool": "cli.js" } }));
  writeFileSync(join(pkg, "cli.js"), '#!/usr/bin/env node\nconsole.log("fake-tool " + process.argv[2]);\n', { mode: 0o755 });
  const file = write(repo, "pipe.yml", `
$vars:
  TOOL_VERSION: { default: "file:${pkg}" }
packages:
  fake-tool!: vars.TOOL_VERSION
stages:
  - id: one
    run!sh: npx fake-tool ran > "$STAGE_DIR/out.txt" && fake-tool too >> "$STAGE_DIR/out.txt"
    outputs: [out.txt]
`);
  const dir = join(repo, ".qa");
  const code = await inRepo(repo, () => new Pipeline({ name: file, dir, runTask }).run());
  assert.equal(code, 0);
  assert.equal(readFileSync(join(dir, "1-one", "out.txt"), "utf8"), "fake-tool ran\nfake-tool too\n");
  assert.ok(existsSync(join(dir, ".packages", "lib", "node_modules", "fake-tool")));
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
  const spec = (id, extra) => ({ id, title: id, emoji: "🔹", inputs: [], outputs: [], when: [], stopOn: [], optional: false, ...extra });
  const stages = [new TaskStage(spec("req", { task: "Req." }), "1-req"), new TaskStage(spec("cases", { task: "Cases." }), "2-cases")];
  const records = { req: { id: "req", status: "pass", report: "1-req/req.md" }, cases: { id: "cases", status: "skipped", reason: "No tests." } };
  const state = { record: { round: 1, status: "pass" }, stage: (id) => records[id] };
  const summary = new SummaryStage({ name: "p" }, undefined, stages, state, dir);
  assert.equal(
    summary.draft(dir),
    "### 🔹 req\n\n#### Breakdown\n\n- one\n\n```\n# not a heading\n```\n\n##### Risks\n\n1. two\n\n### 🔹 cases\n\nSkipped: No tests.\n"
  );
});

test("env values are formulas: a URL's host and path, and one env key read by another", () => {
  const definition = new PipelineFile("p.yml").parse(`
env:
  SITE!: replace(vars.URL, "^[a-z]+://([^/]+).*$", "$1")
  PAGE!: slug(replace(vars.URL, "^[a-z]+://[^/]*|[?#].*$", ""))
  KEY!: env.SITE + "-" + env.PAGE
  NONE!: vars.MISSING
stages:
  - id: a
    run!sh: echo "$KEY"
`);
  const env = definition.values({ URL: "https://staging.example.com/users/Settings?tab=1" }).env();
  assert.deepEqual(env, { SITE: "staging.example.com", PAGE: "users-settings", KEY: "staging.example.com-users-settings" });
});

test("an unknown function or name is bad usage, found before anything runs", () => {
  const stage = "stages:\n  - id: a\n    title: a\n    emoji: 🔹\n";
  assert.throws(() => parse(`env:\n  SITE!: hots(vars.URL)\n${stage}    run!sh: echo\n`), /env.SITE!: unknown function "hots"/);
  assert.throws(() => parse(`${stage}    run!task: Check {{ vars.URL + }}\n`), /stages.a.run!task/);
  assert.throws(() => parse(`${stage}    run!task: Check {{ url }}\n`), /unknown name "url"/);
});

const twoStages = (first) => `
stages:
  - id: one
    title: one
    emoji: 🔹
    run!task: ${first}
    timeout: 1s
  - id: two
    title: two
    emoji: 🔹
    run!task: Two.
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
    run!sh: printf 'a\\nb\\n' > "$STAGE_DIR/items.txt"
    outputs: [items.txt]
  - id: each
    title: each
    emoji: 🔹
    each_line: items.txt
    run!task: Check it.
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
  const file = write(repo, "pipe.yml", "stages:\n  - id: one\n    title: one\n    emoji: 🔹\n    run!task: One.\n");
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

test("run!decide takes a question, its context and a threshold; run!extract what to find and the values", () => {
  const spec = parse(`
stages:
  - id: review
    session: qa
    run!task: Review it.
  - id: ready
    run!decide:
      question: Is the build green?
      context: { stages: review, sessions: [qa], files: spec.md, sh: [git log -1, git diff --stat] }
      threshold: 0.8
  - id: deploy
    run!extract:
      what: The preview deployment of this pull request
      values:
        url: public url of a page
`);
  const [, ready, deploy] = spec.stages;
  assert.deepEqual(ready.decide, {
    question: "Is the build green?",
    context: { stages: ["review"], sessions: ["qa"], files: ["spec.md"], sh: ["git log -1", "git diff --stat"] },
    threshold: 0.8,
  });
  assert.deepEqual(deploy.extract, { what: "The preview deployment of this pull request", values: ["url: public url of a page"] });
});

test("decide and extract are checked against their shape and the stages before them", () => {
  const stage = (run) => parse(`stages:\n  - id: review\n    session: qa\n    run!task: hi\n  - id: a\n${run}`);
  assert.throws(() => stage("    run!decide: ok?\n"), /"run!decide" must be a map with the fields of Decide/);
  assert.throws(() => stage("    run!decide: { questoin: ok? }\n"), /missing required field "question"/);
  assert.throws(() => stage("    run!decide: { question: ok?, context: { stage: review } }\n"), /"stage" is not a field of the schema/);
  assert.throws(() => stage("    run!decide: { question: ok? }\n"), /needs context: stages, sessions, files or sh, or inputs/);
  assert.throws(() => stage("    run!decide: { question: ok?, context: { stages: later } }\n"), /context stage "later" is not a stage before it/);
  assert.throws(() => stage("    run!decide: { question: ok?, context: { sessions: other } }\n"), /context session "other" is not the session of a stage before it/);
  assert.throws(() => stage("    run!decide: { question: ok?, context: { files: a.md }, threshold: 2 }\n"), /between 0 and 1/);
  assert.throws(() => stage("    run!decide: { question: ok?, context: { files: a.md } }\n    session: s\n"), /run!decide has no session/);
  assert.throws(() => stage("    run!decide: { question: ok?, context: { files: a.md } }\n    threshold: 0.5\n"), /threshold is now run!decide: \{ question, threshold \}/);
  assert.throws(() => stage("    run!extract: { values: { url: the url } }\n"), /missing required field "what"/);
  assert.throws(() => stage("    run!extract: { what: x, values: the url }\n"), /run!extract values is a map of the values to find/);
  assert.throws(() => stage("    run!extract: { what: x, values: { pr-url: the url } }\n"), /"pr-url" is not a name a formula can read/);
  assert.throws(() => stage("    run!extract: { what: x, values: { sha: \"the {{ vars.X }}\" } }\n"), /sha is plain text: no \{\{ \}\}/);
});

// Answers yes when any state value says "green"; "BROKEN" in the question is a failed call.
function fakeDecide(log) {
  return async (request, model) => {
    appendFileSync(log, JSON.stringify({ decide: request.question, state: request.state, threshold: request.threshold, model }) + "\n");
    if (request.question.includes("BROKEN")) {
      const { DecisionError } = await import("../dist/src/decision.js");
      throw new DecisionError("fetch failed");
    }
    const yes = Object.values(request.state).some((text) => text.includes("green"));
    const probability = yes ? 0.9 : 0.1;
    return { answer: probability >= (request.threshold ?? 0.5) ? "yes" : "no", probability, threshold: request.threshold ?? 0.5, question: request.question, model: model ?? "fake/clef", tokens: { input: 1, output: 0 } };
  };
}

// The fake task, plus values for an extract request.
function fakeExtractTask(log) {
  const task = fakeTask(log);
  return async (request, control) => {
    if (!request.extract) return task(request, control);
    appendFileSync(log, JSON.stringify({ extract: request.extract, outputs: request.outputs }) + "\n");
    if (request.prompt.includes("NOTHING")) return { code: 1, envelope: { status: "fail", reason: "not found" }, undelivered: false };
    const values = Object.fromEntries(request.extract.map((field) => [field.name, `the ${field.name}`]));
    for (const out of request.outputs) writeFileSync(out, JSON.stringify({ status: "pass", values }));
    return { code: 0, envelope: { status: "pass", reason: null, values }, undelivered: false };
  };
}

const DECIDE_PIPELINE = (question, url = "public url of a page") => `
stages:
  - id: build
    run!sh: echo "the build is $BUILD" > "$STAGE_DIR/build.txt"
    outputs: [build.txt]
  - id: ready
    run!decide: { question: "${question}" }
    inputs: [build.txt]
  - id: deploy
    run!extract:
      what: The deployment of this pull request
      values:
        url: ${url}
        version: the version
  - id: use
    run!sh: cat "$STAGE_DIR/deploy.values.json"
    inputs: [deploy.values.json]
`;

test("a decide stage passes on yes and judges its inputs; extract values reach a later stage", async () => {
  const { repo, log } = setup();
  const file = write(repo, "pipe.yml", DECIDE_PIPELINE("Is the build green?"));
  const dir = join(repo, ".qa");
  const options = { name: file, dir, runTask: fakeExtractTask(log), decide: fakeDecide(log), sets: { BUILD: "green", TESTEIYA_DECISION_MODEL: "fake/jev" } };
  assert.equal(await inRepo(repo, () => new Pipeline(options).run()), 0);

  const decided = calledWith(log).find((call) => call.decide);
  assert.equal(decided.decide, "Is the build green?");
  assert.deepEqual(Object.keys(decided.state), ["build.txt"]);
  assert.equal(decided.model, "fake/jev");
  assert.equal(readJson(join(dir, "2-ready", "ready.json")).answer, "yes");
  assert.match(readFileSync(join(dir, "2-ready", "ready.md"), "utf8"), /^\*\*Yes\*\*: Is the build green\?/);

  const extracted = calledWith(log).find((call) => call.extract);
  assert.deepEqual(extracted.extract.map((field) => field.name), ["url", "version"]);
  assert.ok(extracted.outputs.every((out) => !out.endsWith(".md")), "the model is not asked for a report");
  assert.deepEqual(readJson(join(dir, "3-deploy", "deploy.values.json")), { url: "the url", version: "the version" });
  assert.equal(readFileSync(join(dir, "3-deploy", "deploy.md"), "utf8"), "url: the url\nversion: the version\n");
  assert.match(readFileSync(join(dir, "4-use", "use.log"), "utf8"), /"url": "the url"/);
});

test("a no fails the decide stage and stops the run; a failed call is broken, not a no", async () => {
  const { repo, log } = setup();
  const dir = join(repo, ".qa");
  const no = write(repo, "no.yml", DECIDE_PIPELINE("Is the build green?"));
  const options = { name: no, dir, runTask: fakeExtractTask(log), decide: fakeDecide(log), sets: { BUILD: "red" } };
  assert.equal(await inRepo(repo, () => new Pipeline(options).run()), 1);
  let stages = readJson(join(dir, "pipeline.json")).stages;
  assert.equal(stages[1].status, "fail");
  assert.match(stages[1].reason, /no \(p=0.10\)/);
  assert.equal(stages[2].status, "not-run");

  const broken = write(repo, "broken.yml", DECIDE_PIPELINE("BROKEN?"));
  const brokenDir = join(repo, ".qb");
  assert.equal(await inRepo(repo, () => new Pipeline({ ...options, name: broken, dir: brokenDir }).run()), 1);
  stages = readJson(join(brokenDir, "pipeline.json")).stages;
  assert.equal(stages[1].status, "broken");
  assert.match(stages[1].reason, /no answer: fetch failed/);
});

test("an extract stage that finds nothing fails", async () => {
  const { repo, log } = setup();
  const dir = join(repo, ".qa");
  const file = write(repo, "pipe.yml", DECIDE_PIPELINE("Is the build green?", "NOTHING here"));
  const options = { name: file, dir, runTask: fakeExtractTask(log), decide: fakeDecide(log), sets: { BUILD: "green" } };
  assert.equal(await inRepo(repo, () => new Pipeline(options).run()), 1);
  const stages = readJson(join(dir, "pipeline.json")).stages;
  assert.equal(stages[2].status, "fail");
  assert.ok(!existsSync(join(dir, "3-deploy", "deploy.values.json")));
});

test("a pipeline with a decide stage checks the decision model before it runs", async () => {
  const { repo, log } = setup();
  const file = write(repo, "pipe.yml", "stages:\n  - id: ready\n    run!decide: { question: Is it green?, context: { sh: echo green } }\n");
  const checkDecider = async () => {
    throw new UsageError("No decision model: set TESTEIYA_DECISION_MODEL");
  };
  const options = { name: file, dir: join(repo, ".qa"), runTask: fakeTask(log), decide: fakeDecide(log), checkDecider };
  await assert.rejects(inRepo(repo, () => new Pipeline(options).run()), /No decision model/);
  assert.equal(await inRepo(repo, () => new Pipeline(options).check()), 1);
});

const GIT_PIPELINE = (prUrl = "pull request url") => `
prerequisites:
  git:
    $value!extract:
      what: The pull request under test. Use gh and git.
      values:
        sha: sha of the commit
        pr_url: ${prUrl}
env:
  GIT_SHA!: prerequisites.git.sha
stages:
  - id: review
    when!: prerequisites.git != null
    run!task: Review {{ prerequisites.git.pr_url }} at {{ prerequisites.git.sha }}.
  - id: log
    run!sh: echo "sha=$GIT_SHA" > "$STAGE_DIR/sha.txt"
    outputs: [sha.txt]
`;

test("$value!extract asks the agent what it says, before the first stage; stages and env read the values", async () => {
  const { repo, log } = setup();
  const file = write(repo, "pipe.yml", GIT_PIPELINE());
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask: fakeExtractTask(log) }).run()), 0);

  const [asked] = calledWith(log).filter((call) => call.extract);
  assert.deepEqual(asked.extract.map((field) => field.name), ["sha", "pr_url"]);
  const review = calledWith(log).find((call) => !call.extract && call.prompt.startsWith("Review"));
  assert.match(review.prompt, /^Review the pr_url at the sha\./);
  assert.equal(readFileSync(join(dir, "2-log", "sha.txt"), "utf8"), "sha=the sha\n");
});

test("a value still empty fails the $value!extract prerequisite: its stages skip, formulas read null", async () => {
  const { repo, log } = setup();
  const file = write(repo, "pipe.yml", GIT_PIPELINE("NOTHING to find"));
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: file, dir, runTask: fakeExtractTask(log) }).run()), 0);
  const stages = readJson(join(dir, "pipeline.json")).stages;
  assert.equal(stages[0].status, "skipped");
  assert.equal(stages[0].reason, "Not found: sha, pr_url.");
  assert.equal(readFileSync(join(dir, "2-log", "sha.txt"), "utf8"), "sha=\n");
});

test("a dry run and pipeline-check ask no model: what a run would ask is pending", async () => {
  const { repo, log } = setup();
  const file = write(repo, "pipe.yml", GIT_PIPELINE());
  const options = { name: file, dir: join(repo, ".qa"), runTask: fakeExtractTask(log), decide: fakeDecide(log) };
  assert.equal(await inRepo(repo, () => new Pipeline({ ...options, dryRun: true }).run()), 0);
  assert.equal(await inRepo(repo, () => new Pipeline(options).check()), 0);
  assert.equal(calledWith(log).length, 0, "no model is asked");
});

test("a model is asked only for a run that goes on", async () => {
  const { repo, log } = setup();
  const file = write(repo, "pipe.yml", GIT_PIPELINE());
  const options = { name: file, dir: join(repo, ".qa"), runTask: fakeExtractTask(log), gates: { pr: "false" } };
  assert.equal(await inRepo(repo, () => new Pipeline(options).run()), 0);
  assert.equal(readJson(join(repo, ".qa", "pipeline.json")).status, "skipped");
  assert.equal(calledWith(log).length, 0, "a skipped run asks no model");
});

test("run!decide judges its context: an earlier stage's report, a session's last answer, files and commands", async () => {
  const { repo, log } = setup();
  write(repo, "spec.md", "# Spec\nThe page is blue.\n");
  const file = write(repo, "pipe.yml", `
stages:
  - id: review
    session: qa
    run!task: Review it.
  - id: ready
    run!decide:
      question: Is {{ vars.WHAT }} green?
      context:
        stages: review
        sessions: qa
        files: spec.md
        sh: echo "the build is $BUILD"
      threshold: 0.6
`);
  const dir = join(repo, ".qa");
  const runTask = async (request, control) => {
    const outcome = await fakeTask(log)(request, control);
    // The session the fake task does not write: one answer.
    const session = SessionManager.open(request.sessionFile, undefined, repo);
    session.appendMessage({ role: "user", content: "Review it.", timestamp: 1 });
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    session.appendMessage({ role: "assistant", content: [{ type: "text", text: "Two scenarios break." }], api: "x", provider: "x", model: "x", usage, stopReason: "stop", timestamp: 2 });
    return outcome;
  };
  const options = { name: file, dir, runTask, decide: fakeDecide(log), sets: { BUILD: "green", WHAT: "the build" } };
  assert.equal(await inRepo(repo, () => new Pipeline(options).run()), 0);
  const decided = calledWith(log).find((call) => call.decide);
  assert.equal(decided.decide, "Is the build green?");
  assert.equal(decided.threshold, 0.6);
  assert.deepEqual(Object.keys(decided.state), ["stage review", "session qa", "spec.md", '$ echo "the build is $BUILD"']);
  assert.match(decided.state["stage review"], /\S/);
  assert.equal(decided.state["session qa"], "Two scenarios break.");
  assert.equal(decided.state["spec.md"], "# Spec\nThe page is blue.\n");
  assert.equal(decided.state['$ echo "the build is $BUILD"'], "the build is green\n");
});

test("$value!decide asks the decision model before the first stage; a no skips the stages that read it", async () => {
  const { repo, log } = setup();
  const pipeline = (build) => `
prerequisites:
  green:
    $value!decide:
      question: Is the build green?
      context: { sh: echo "${build}" }
    message: The build is not green.
stages:
  - id: ship
    when!: prerequisites.green
    run!sh: echo shipped > "$STAGE_DIR/out.txt"
`;
  const dir = join(repo, ".qa");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: write(repo, "yes.yml", pipeline("green")), dir, runTask: fakeTask(log), decide: fakeDecide(log) }).run()), 0);
  assert.equal(readJson(join(dir, "pipeline.json")).stages[0].status, "pass");
  assert.deepEqual(calledWith(log).find((call) => call.decide).state, { '$ echo "green"': "green\n" });

  const no = join(repo, ".qb");
  assert.equal(await inRepo(repo, () => new Pipeline({ name: write(repo, "no.yml", pipeline("red")), dir: no, runTask: fakeTask(log), decide: fakeDecide(log) }).run()), 0);
  const [ship] = readJson(join(no, "pipeline.json")).stages;
  assert.equal(ship.status, "skipped");
  assert.equal(ship.reason, "The build is not green.");
});

test("$value!decide judges files and commands only: no stage has run before it", () => {
  const gate = (context) => parse(`prerequisites:\n  a:\n    $value!decide: { question: ok?, context: ${context} }\n    message: m\nstages:\n  - id: a\n    run!sh: echo\n`);
  assert.deepEqual(gate("{ files: a.md }").prerequisites.a.decide, { question: "ok?", context: { stages: [], sessions: [], files: ["a.md"], sh: [] } });
  assert.throws(() => gate("{ stages: a }"), /context takes files and sh, not stages or sessions/);
  assert.throws(() => gate("{}"), /needs context: files or sh/);
});

test("the old stage keys in a patch fail with the new spelling", () => {
  assert.throws(() => overridden(Override.stage("plan:task: { $after: x }")), /--stage plan: task is now run!task/);
  assert.throws(() => overridden(Override.stage("plan:$add: { decide: ok? }")), /--stage plan: decide is now run!decide/);
  assert.throws(() => overridden(Override.pipeline("stages: { $after: { late: { extract: x } } }")), /--pipeline: extract is now run!extract/);
});

test("$value!extract says what to find and the values; its message is optional", () => {
  const extract = (value) => parse(`prerequisites:\n  git:\n    $value!extract: ${value}\nstages:\n  - id: a\n    run!sh: echo\n`);
  assert.deepEqual(extract("{ what: The PR, values: { sha: the commit } }").prerequisites.git, {
    message: "Not found: sha.",
    env: [],
    needs: [],
    secret: false,
    extract: { what: "The PR", values: ["sha: the commit"] },
  });
  assert.throws(() => extract("{ sha: the commit }"), /missing required field "what"/);
  assert.throws(() => extract("{ what: x, values: { pr-url: the url } }"), /"pr-url" is not a name a formula can read/);
});
