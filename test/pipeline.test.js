import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { matchChanges, readChanges } from "../dist/src/changes.js";
import { expand } from "../dist/src/gates.js";
import { listBundled, parseDuration, parsePipeline } from "../dist/src/pipeline-file.js";
import { runPipeline } from "../dist/src/pipeline.js";

// Stands in for `testeiya task`: logs its argv, writes the report, the envelope
// and every file the task asks for. "FAIL" in a task is a negative verdict.
const FAKE = `
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const task = args.at(-1);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + "\\n");
if (process.env.FAKE_SLOW && task.includes("SLOW")) await new Promise((done) => setTimeout(done, 20000));
const dir = task.match(/Pipeline folder: (.*)/)[1];
const wanted = task.match(/Write these files: (.*)/);
for (const file of wanted ? wanted[1].split(", ") : []) writeFileSync(join(dir, file), "written\\n");
for (let i = 0; i < args.length; i++) {
  if (args[i] !== "-o") continue;
  const out = args[i + 1];
  if (out.endsWith(".json")) writeFileSync(out, JSON.stringify({ status: task.includes("FAIL") ? "fail" : "pass", reason: "found it" }));
  else writeFileSync(out, "report of " + task.split("\\n")[0] + "\\n");
}
`;

test("every bundled pipeline loads", () => {
  const names = listBundled().map((pipeline) => pipeline.name);
  assert.deepEqual(names, ["api-testing", "pr-review", "regression", "web-testing"]);
});

test("a stage naming an undefined gate is bad usage", () => {
  const text = "stages:\n  - id: a\n    run: echo\n    gates: [staging]\n";
  assert.throws(() => parsePipeline(text, "p.yml"), /names gate "staging"/);
});

test("a stage needs exactly one of task or run", () => {
  assert.throws(() => parsePipeline("stages:\n  - id: a\n", "p.yml"), /exactly one of task or run/);
  const both = "stages:\n  - id: a\n    run: echo\n    task: hi\n";
  assert.throws(() => parsePipeline(both, "p.yml"), /exactly one of task or run/);
});

test("reserved ids, unknown keys and stray stopOn are rejected", () => {
  assert.throws(() => parsePipeline("stages:\n  - id: summary\n    run: echo\n", "p.yml"), /reserved/);
  assert.throws(() => parsePipeline("stages:\n  - id: a\n    run: echo\n    model: x\n", "p.yml"), /unknown key "model"/);
  assert.throws(() => parsePipeline("stages:\n  - id: a\n    run: echo\n    stopOn: always\n", "p.yml"), /stopOn/);
});

test("an output may not reuse a stage's own file name", () => {
  const text = "stages:\n  - id: plan\n    task: hi\n  - id: b\n    task: hi\n    outputs: [plan.md]\n";
  assert.throws(() => parsePipeline(text, "p.yml"), /plan.md is a file stage "plan" writes/);
});

test("durations read seconds, minutes and hours", () => {
  assert.equal(parseDuration("90s"), 90_000);
  assert.equal(parseDuration("30m"), 1_800_000);
  assert.equal(parseDuration("1h"), 3_600_000);
  assert.equal(parseDuration(5), 5_000);
  assert.equal(parseDuration("soon"), null);
});

test("variables expand the shell's way", () => {
  assert.equal(expand("${A}/x", { A: "a" }), "a/x");
  assert.equal(expand("${B:-origin/main}", {}), "origin/main");
  assert.equal(expand("[${MISSING}]", {}), "[]");
});

test("a changes check counts what is not ignored", () => {
  const files = ["src/api/users.ts", "README.md", "docs/a.md"];
  assert.equal(matchChanges(files, { minFiles: 2, ignore: ["**/*.md", "*.md"] }), false);
  assert.equal(matchChanges(files, { paths: ["src/api/**"] }), true);
  assert.equal(matchChanges(files, { paths: ["src/ui/**"] }), false);
  assert.equal(matchChanges(["README.md"], { ignore: ["*.md"] }), false);
});

test("changes count from the merge base, then from the last round", async () => {
  const repo = gitRepo();
  git(repo, "checkout", "-q", "-b", "feature");
  commit(repo, "src/a.ts");
  commit(repo, "src/b.ts");
  const first = await readChanges(repo, null, { BASE_BRANCH: "main" });
  assert.deepEqual(first.files, ["src/a.ts", "src/b.ts"]);

  const since = git(repo, "rev-parse", "HEAD");
  commit(repo, "src/c.ts");
  const later = await readChanges(repo, since, { BASE_BRANCH: "main" });
  assert.deepEqual(later.files, ["src/c.ts"]);
});

test("a pipeline runs stages, skips closed gates, loops and summarizes", async () => {
  const { repo, log, cli } = setup();
  const file = write(repo, "pipe.yml", `
name: demo
gates:
  staging:
    env: [DEMO_STAGING_URL]
    message: No staging URL.
stages:
  - id: review
    session: qa
    task: Review it.
    outputs: [endpoints.txt]
  - id: list
    run: printf '/users\\n\\n/orders\\n' > "$PIPELINE_DIR/endpoints.txt"
  - id: check
    each_line: endpoints.txt
    run: echo "checking $ITEM"
  - id: explore
    gates: [staging]
    task: Explore it.
  - id: results
    session: qa
    task: Read results.
    inputs: [explore.md, review.md]
`);
  const dir = join(repo, ".qa");
  mkdirSync(join(repo, "out"));
  const code = await inRepo(repo, () => runPipeline({ name: file, dir, cli, outputs: ["gh:pr#7", "out/final.md"], thread: "demo" }));
  assert.equal(code, 0);

  const state = readJson(join(dir, "pipeline.json"));
  assert.deepEqual(
    state.stages.map((stage) => [stage.id, stage.status]),
    [["review", "pass"], ["list", "pass"], ["check", "pass"], ["explore", "skipped"], ["results", "pass"], ["summary", "pass"]]
  );
  assert.equal(state.stages[3].reason, "No staging URL.");
  assert.deepEqual(state.stages[2].items.map((item) => item.item), ["/users", "/orders"]);
  assert.match(readFileSync(join(dir, "check.log"), "utf8"), /checking \/orders/);

  const calls = calledWith(log);
  const results = calls.find((args) => args.at(-1).startsWith("Read results."));
  assert.match(results.at(-1), /Read these first: review.md/);
  assert.match(results.at(-1), /Not available: explore.md \(stage explore skipped: No staging URL.\)/);
  assert.ok(results.includes("--no-thread"));
  assert.ok(results.includes(join(dir, ".sessions", "qa.jsonl")));

  const summary = calls.find((args) => args.at(-1).startsWith("/pipeline-report"));
  assert.ok(!summary.includes("--no-thread"));
  assert.ok(!summary.includes("--followup"));
  assert.ok(summary.includes("gh:pr#7"));
  assert.ok(!summary.includes("out/final.md"));
  assert.equal(calls.filter((args) => args.includes("gh:pr#7")).length, 1);
  assert.ok(existsSync(join(repo, "out/final.md")));
});

test("changes git cannot read stop the run instead of skipping it", async () => {
  const { repo, cli } = setup();
  const file = write(repo, "pipe.yml", `
gates:
  big:
    changes: { min_files: 1 }
    message: Too small.
when: [big]
stages:
  - id: one
    run: echo one
`);
  await assert.rejects(
    inRepo(repo, () => runPipeline({ name: file, dir: join(repo, ".qa"), cli, sets: { BASE_BRANCH: "nope" } })),
    /fetch-depth: 0/
  );
});

test("the checkout itself is not a pipeline folder", async () => {
  const { repo, cli } = setup();
  const file = write(repo, "pipe.yml", "stages:\n  - id: one\n    run: echo one\n");
  await assert.rejects(inRepo(repo, () => runPipeline({ name: file, dir: repo, cli })), /folder of its own/);
});

test("a failed gate in when skips the whole run", async () => {
  const { repo, log, cli } = setup();
  const file = write(repo, "pipe.yml", `
gates:
  coverage:
    file: [coverage.tests.yml]
    message: No coverage map.
when: [coverage]
stages:
  - id: one
    task: One.
  - id: two
    task: Two.
`);
  const dir = join(repo, ".qa");
  const code = await inRepo(repo, () => runPipeline({ name: file, dir, cli }));
  assert.equal(code, 0);
  assert.equal(readJson(join(dir, "pipeline.json")).status, "skipped");
  assert.equal(calledWith(log).length, 0);
});

test("stopOn fail stops the stages after it, the summary still runs", async () => {
  const { repo, log, cli } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    task: FAIL on purpose.
    stopOn: fail
  - id: two
    task: Two.
`);
  const dir = join(repo, ".qa");
  const code = await inRepo(repo, () => runPipeline({ name: file, dir, cli }));
  assert.equal(code, 1);
  const state = readJson(join(dir, "pipeline.json"));
  assert.deepEqual(state.stages.map((stage) => stage.status), ["fail", "not-run", "pass"]);
  assert.equal(calledWith(log).length, 2);
  assert.equal(await inRepo(repo, () => runPipeline({ name: file, dir: join(repo, ".qb"), cli, exitZero: true })), 0);
});

test("a timed-out round retries from the stage that stopped", async () => {
  const { repo, log, cli } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    session: qa
    task: One.
  - id: two
    session: qa
    task: SLOW two.
    timeout: 1s
  - id: three
    task: Three.
`);
  const dir = join(repo, ".qa");
  process.env.FAKE_SLOW = "1";
  const first = await inRepo(repo, () => runPipeline({ name: file, dir, cli }));
  delete process.env.FAKE_SLOW;
  assert.equal(first, 1);
  const stopped = readJson(join(dir, "pipeline.json"));
  assert.deepEqual(stopped.stages.map((stage) => stage.status), ["pass", "timeout", "not-run", "pass"]);

  rmSync(log);
  const second = await inRepo(repo, () => runPipeline({ name: file, dir, cli }));
  assert.equal(second, 0);
  const calls = calledWith(log);
  assert.deepEqual(calls.map((args) => args.at(-1).split("\n")[0]), ["SLOW two.", "Three.", "/pipeline-report"]);
  assert.ok(calls[0].includes("--followup"));
  assert.equal(readJson(join(dir, "pipeline.json")).round, 1);
});

test("a new commit starts a new round counted from the last one", async () => {
  const { repo, cli } = setup();
  const file = write(repo, "pipe.yml", `
stages:
  - id: one
    run: cp "$PIPELINE_DIR/changes.txt" "$PIPELINE_DIR/seen.txt"
    outputs: [seen.txt]
`);
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "pipeline");
  const dir = join(repo, ".qa");
  await inRepo(repo, () => runPipeline({ name: file, dir, cli, sets: { BASE_BRANCH: "main" } }));
  const firstCommit = git(repo, "rev-parse", "HEAD");

  commit(repo, "src/new.ts");
  await inRepo(repo, () => runPipeline({ name: file, dir, cli, sets: { BASE_BRANCH: "main" } }));
  const state = readJson(join(dir, "pipeline.json"));
  assert.equal(state.round, 2);
  assert.equal(state.since, firstCommit);
  assert.equal(readFileSync(join(dir, "seen.txt"), "utf8").trim(), "src/new.ts");
  assert.deepEqual(state.rounds.map((entry) => entry.round), [1, 2]);
});

function setup() {
  const repo = gitRepo();
  const cli = write(repo, "fake-cli.mjs", FAKE);
  const log = join(repo, "calls.log");
  process.env.FAKE_LOG = log;
  writeFileSync(join(repo, ".gitignore"), ".qa/\n.qb/\ncalls.log\nout/\n");
  return { repo, log, cli };
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
