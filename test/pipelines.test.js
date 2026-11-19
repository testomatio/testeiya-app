import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Pipeline, PipelineError, Pipelines } from "testeiya/pipeline";
import { Variables } from "../dist/src/pipeline/variables.js";
import { UsageError } from "../dist/src/model.js";

const ROOT = join(import.meta.dirname, "..");

const pipelines = new Pipelines();
const parse = (yaml, options) => pipelines.parse(yaml, options);

/** The table in the spec: required, then what each unlocking input unlocks, then the optional rest. */
function table(pipeline) {
  const list = pipeline.inputs();
  return {
    order: list.map((input) => input.name),
    required: list.filter((input) => input.required).map((input) => input.name),
    unlocks: Object.fromEntries(list.filter((input) => input.unlocks.length).map((input) => [input.name, input.unlocks])),
    optional: Object.fromEntries(
      list.filter((input) => !input.required && !input.unlocks.length).map((input) => [input.name, input.default]),
    ),
  };
}

test("the bundled pipelines open by file name", () => {
  const files = readdirSync(join(ROOT, "pipelines")).filter((file) => file.endsWith(".yml")).map((file) => file.slice(0, -4)).sort();
  assert.deepEqual(pipelines.names(), files);
  assert.equal(pipelines.open("regression").source, readFileSync(join(ROOT, "pipelines", "regression.yml"), "utf8"));
  assert.ok(pipelines.open("regression") instanceof Pipeline);
  assert.equal(pipelines.has("regression"), true);
  assert.equal(pipelines.has("nope"), false);
  assert.throws(() => pipelines.open("nope"), (err) => err instanceof PipelineError && err.message === 'no pipeline "nope"');
});

// One pipeline with every kind of input: required, unlocking, defaulted, and the ones that are no input at all.
const SAMPLE = parse(`
prerequisites:
  issue: {env: [ISSUE_URL], message: No issue.}
  map: {file: [coverage.yml], message: No map.}
  staging: {env: [STAGING_URL], message: No staging.}
  browser: {run: 'ls "\${BROWSERS:-$HOME/.cache}"', message: No browser.}
  token: {env: [TOKEN], message: No token., secret: true}
when: [issue, map]
env:
  BASE_BRANCH: \${BASE_BRANCH:-origin/main}
  SLUG: \${ISSUE_URL | path | slugify}
packages:
  tool: \${TOOL_VERSION:-latest}
stages:
  - id: plan
    session: qa
    task: Plan \${ISSUE_URL} on \${GIT_BRANCH}.
    outputs: [urls.txt]
  - id: explore
    when: [staging, browser, token]
    each_line: urls.txt
    run: OUT="$STAGE_DIR/x" tool "$STAGING_URL" "$ITEM" "$OUT"
`, { name: "sample" });

test("inputs: required first, then what unlocks stages, then the rest by name", () => {
  // OUT is assigned, HOME the OS's, SLUG an env key, GIT_BRANCH, STAGE_DIR and ITEM the runner's: none is an input.
  // BROWSERS defaults to a value that reads another variable, so it has no default.
  assert.deepEqual(table(SAMPLE), {
    order: ["ISSUE_URL", "STAGING_URL", "TOKEN", "BASE_BRANCH", "BROWSERS", "TOOL_VERSION"],
    required: ["ISSUE_URL"],
    unlocks: { STAGING_URL: ["explore"], TOKEN: ["explore"] },
    optional: { BASE_BRANCH: "origin/main", BROWSERS: undefined, TOOL_VERSION: "latest" },
  });
  const [issue] = SAMPLE.inputs();
  assert.equal(issue.message, "No issue.");
  assert.deepEqual(issue.prerequisites, ["issue"]);
  assert.deepEqual(issue.usedIn, ["prerequisite", "env", "task"]);
});

test("the optional rest is sorted by name", () => {
  const text = "env:\n  A: ${ZED}\n  B: ${ALPHA}\nstages:\n  - id: one\n    run: echo $MID\n";
  assert.deepEqual(parse(text).describe().inputs.map((input) => input.name), ["ALPHA", "MID", "ZED"]);
});

test("a secret prerequisite marks its variables secret", () => {
  const description = SAMPLE.describe();
  assert.equal(description.inputs.find((input) => input.name === "TOKEN").secret, true);
  assert.equal(description.inputs.find((input) => input.name === "STAGING_URL").secret, false);
  assert.equal(description.prerequisites.find((gate) => gate.name === "token").secret, true);
  assert.throws(() => parse("prerequisites:\n  a:\n    env: [A]\n    secret: yes please\n    message: m\nstages:\n  - id: x\n    run: echo\n").spec(), /secret must be true or false/);
  assert.throws(() => parse("prerequisites:\n  a:\n    file: [x]\n    secret: true\n    message: m\nstages:\n  - id: x\n    run: echo\n").spec(), /secret hides env variables/);
});

test("prerequisites are described by scope and the checks a UI cannot set", () => {
  const { prerequisites } = SAMPLE.describe();
  assert.deepEqual(prerequisites.find((gate) => gate.name === "map"), {
    name: "map",
    message: "No map.",
    scope: "run",
    stages: [],
    env: [],
    checks: ["file"],
    secret: false,
  });
  assert.deepEqual(prerequisites.find((gate) => gate.name === "browser").checks, ["run"]);
  assert.deepEqual(prerequisites.find((gate) => gate.name === "staging").stages, ["explore"]);
  const unused = parse("prerequisites:\n  x:\n    env: [X]\n    message: m\nstages:\n  - id: a\n    run: echo\n").describe();
  assert.equal(unused.prerequisites[0].scope, "unused");
  assert.deepEqual(unused.inputs.map((input) => [input.name, input.required, input.unlocks]), [["X", false, []]]);
});

test("stages are described for a UI", () => {
  const description = SAMPLE.describe();
  assert.equal(description.name, "sample");
  const explore = description.stages.find((stage) => stage.id === "explore");
  assert.equal(explore.kind, "run");
  assert.match(explore.text, /^OUT=/);
  assert.deepEqual(explore.loop, { each_line: "urls.txt" });
  assert.deepEqual(explore.when, ["staging", "browser", "token"]);
  assert.equal(description.stages.find((stage) => stage.id === "plan").session, "qa");
});

test("a value of its own env that reads its own name is an input, other keys are not", () => {
  const text = "env:\n  BASE: ${BASE:-main}\n  SITE: ${URL | host}\nstages:\n  - id: a\n    task: Use ${SITE} and ${PIPELINE_DIR}\n";
  assert.deepEqual(parse(text).describe().inputs.map((input) => [input.name, input.default]), [
    ["BASE", "main"],
    ["URL", undefined],
  ]);
});

test("shell references skip quotes, assignments, loops and positional parameters", () => {
  const command = `X=1 run "$A" '$B' \${C:-c} \${D-d} \${E:+e} $1 $? $@ $HOME; for F in *; do echo "$F"; done; echo \\$G`;
  assert.deepEqual(Variables.shellReferences(command), [
    { name: "A" },
    { name: "C", default: "c" },
    { name: "D", default: "d" },
    { name: "E" },
    { name: "HOME" },
  ]);
  assert.deepEqual(Variables.references("${A} ${B:-x} ${C | host} $D"), [{ name: "A" }, { name: "B", default: "x" }, { name: "C" }]);
});

test("an error is bad usage with the line and key it is about", () => {
  const text = "name: x\nstages:\n  - id: one\n    run: echo\n  - id: two\n    run: echo\n    when: [staging]\n";
  const err = catchError(() => parse(text).spec());
  assert.ok(err instanceof PipelineError);
  assert.ok(err instanceof UsageError);
  assert.equal(err.message, 'stage "two" when names prerequisite "staging", which prerequisites does not define');
  assert.equal(err.key, "stages[1].when");
  assert.equal(err.line, 7);

  const gate = catchError(() => parse("prerequisites:\n  staging:\n    env: [A]\nstages:\n  - id: a\n    run: echo\n").spec());
  assert.equal(gate.key, "prerequisites.staging");
  assert.equal(gate.line, 2);

  const syntax = catchError(() => parse("stages:\n  - id: a\n    run: [echo\n").spec());
  assert.ok(syntax instanceof PipelineError);
  assert.equal(typeof syntax.line, "number");

  const unknown = catchError(() => parse("stages:\n  - id: a\n    run: echo\n    model: x\n").spec());
  assert.equal(unknown.key, "stages[0].model");
  assert.equal(unknown.line, 4);
});

test("extends finds a bundled pipeline, and a missing one is an error", () => {
  const child = "extends: issue-test-cases\nstages:\n  - id: requirements\n    append_task: Be brief.\n";
  const pipeline = parse(child, { name: "mine" });
  assert.equal(pipeline.describe().name, "issue-test-cases");
  assert.match(pipeline.spec().stages[0].task, /\nBe brief\.$/);
  assert.doesNotMatch(parse(child).yaml(), /extends/);
  assert.equal(pipeline.source, child);
  const [missing] = parse("extends: nope\n").errors();
  assert.equal(missing.message, 'no pipeline "nope" to extend');
  assert.equal(missing.key, "extends");
  assert.equal(missing.line, 1);
});

test("extends finds your own pipelines, which win over the bundled ones", () => {
  const base = "name: base\nstages:\n  - id: a\n    task: Do it.\n";
  const own = new Pipelines({
    base,
    team: "extends: base\nname: team\nstages:\n  - id: a\n    append_task: Be brief.\n",
    "pr-review": base,
  });
  const agent = own.parse("extends: team\nstages:\n  - id: a\n    append_task: In English.\n", { name: "agent" });
  assert.deepEqual(agent.errors(), []);
  assert.equal(agent.describe().name, "team");
  assert.equal(agent.spec().stages[0].task, "Do it.\nBe brief.\nIn English.");
  assert.equal(own.open("team").spec().stages[0].task, "Do it.\nBe brief.");
  assert.equal(own.parse("extends: pr-review\n").describe().name, "base");
  assert.equal(new Pipelines().parse("extends: base\n").errors()[0].message, 'no pipeline "base" to extend');
});

test("your pipeline can extend the bundled one of its own name", () => {
  const own = new Pipelines({ regression: "extends: regression\ndescription: Ours.\n" });
  const regression = own.open("regression");
  assert.deepEqual(regression.errors(), []);
  assert.equal(regression.describe().description, "Ours.");
  assert.deepEqual(regression.stages().map((stage) => stage.id), pipelines.open("regression").stages().map((stage) => stage.id));
  // Another pipeline that extends regression gets yours.
  assert.equal(own.parse("extends: regression\n", { name: "agent" }).describe().description, "Ours.");
  // The text being edited is checked the same way before it is saved.
  assert.equal(pipelines.parse("extends: regression\ndescription: Ours.\n", { name: "regression" }).isValid(), true);
});

test("extends that loops back is an error, not a hang", () => {
  const own = new Pipelines({ a: "extends: b\n", b: "extends: a\n" });
  for (const pipeline of [own.open("a"), own.parse("extends: b\n", { name: "a" }), own.parse("extends: a\n")]) {
    const [loop] = pipeline.errors();
    assert.match(loop.message, /loops back to itself/);
    assert.equal(loop.key, "extends");
    assert.equal(loop.line, 1);
  }
  assert.equal(own.open("a").errors()[0].message, "extends b: extends a loops back to itself");
  const broken = new Pipelines({ base: "stages: [\n" }).parse("name: x\nextends: base\n").errors()[0];
  assert.match(broken.message, /^extends base: /);
  assert.equal(broken.line, 2);
  assert.match(own.parse("extends: nope\n", { name: "nope" }).errors()[0].message, /no pipeline "nope" to extend/);
});

test("the list has every pipeline by the name it opens with, a broken one too", () => {
  assert.deepEqual(pipelines.list().map((pipeline) => pipeline.name), pipelines.names());
  for (const entry of pipelines.list()) assert.ok(entry.bundled && entry.valid, entry.name);
  const own = new Pipelines({
    nightly: "description: Ours.\ntarget: daily-cron\nstages:\n  - id: a\n    run: echo\n",
    broken: "stages: nope\n",
    regression: "extends: regression\ndescription: Ours too.\n",
  });
  const list = own.list();
  assert.deepEqual(list.map((pipeline) => pipeline.name), [...new Set([...pipelines.names(), "nightly", "broken"])].sort());
  assert.deepEqual(list.find((pipeline) => pipeline.name === "nightly"), { name: "nightly", description: "Ours.", target: "daily-cron", bundled: false, valid: true });
  assert.deepEqual(list.find((pipeline) => pipeline.name === "broken"), { name: "broken", description: "", bundled: false, valid: false });
  assert.deepEqual(list.find((pipeline) => pipeline.name === "regression"), { name: "regression", description: "Ours too.", target: "pr", bundled: false, valid: true });
});

test("a pipeline with a mistake answers errors, and throws it from everything that reads it", () => {
  const pipeline = parse("stages:\n  - id: a\n    run: echo\n    model: x\n");
  assert.equal(pipeline.isValid(), false);
  const [error, ...rest] = pipeline.errors();
  assert.deepEqual(rest, []);
  assert.ok(error instanceof PipelineError);
  for (const read of ["describe", "stages", "inputs", "prerequisites", "yaml", "spec"]) {
    assert.equal(catchError(() => pipeline[read]()), error, read);
  }
  const valid = parse("stages:\n  - id: a\n    run: echo $A\n", { name: "agent" });
  assert.equal(valid.isValid(), true);
  assert.deepEqual(valid.errors(), []);
  assert.deepEqual(valid.describe().stages, valid.stages());
  assert.deepEqual(valid.describe().inputs, valid.inputs());
  assert.deepEqual(valid.describe().prerequisites, valid.prerequisites());
  assert.deepEqual(JSON.parse(JSON.stringify(valid.describe())).inputs.map((input) => input.name), ["A"]);
});

test("half-typed text is an error, never a crash", () => {
  const text = pipelines.open("regression").source;
  for (let end = 0; end <= text.length; end++) {
    const typed = text.slice(0, end);
    for (const yaml of [typed, `extends: regression\n${typed}`]) {
      const pipeline = parse(yaml, { name: "regression" });
      assert.equal(pipeline.errors().length, pipeline.isValid() ? 0 : 1, yaml);
    }
  }
  assert.match(parse("stages:\n  - id: a\n    run: *nope\n").errors()[0].message, /Unresolved alias/);
  assert.equal(parse("extends: regression\nstages:\n  -\n").errors()[0].message, "every stage needs an id");
  const empty = new Pipelines({ base: "stages:\n  -\n  - id: a\n    run: echo\n" });
  assert.equal(empty.parse("extends: base\nstages:\n  - id: a\n    title: A\n").errors()[0].message, "stage 1 must be a mapping");
});

test("yaml applies overrides and keeps the name the caller gave", () => {
  const pipeline = parse("stages:\n  - id: a\n    task: Do it.\n", { name: "agent" });
  const changed = pipeline.overrideStage("a", "append_task: Be brief.").override("description: Short.");
  const spec = parse(changed.yaml()).spec();
  assert.equal(spec.name, "agent");
  assert.equal(spec.description, "Short.");
  assert.equal(spec.stages[0].task, "Do it.\nBe brief.");
  assert.equal(pipeline.spec().stages[0].task, "Do it.");
  const [err] = pipeline.overrideStage("nope", "append_task: x").errors();
  assert.ok(err instanceof PipelineError);
  assert.match(err.message, /^--stage nope: there is no stage "nope" to change/);
  assert.equal(pipeline.overrideStage("a", "").errors().length, 1);
  assert.equal(pipeline.override("- not a mapping").errors().length, 1);
});

test("testeiya/pipeline bundles for a browser without node built-ins", () => {
  const out = join(mkdtempSync(join(tmpdir(), "testeiya-browser-")), "pipeline.js");
  execFileSync(join(ROOT, "node_modules", ".bin", "esbuild"), [
    join(ROOT, "dist", "src", "pipeline", "index.js"),
    "--bundle",
    "--platform=browser",
    "--format=esm",
    `--outfile=${out}`,
    "--log-level=error",
  ]);
  // A bare `fs` fails the build above; a `node:` import would only fail in the browser.
  assert.doesNotMatch(readFileSync(out, "utf8"), /["']node:[a-z]/);
});

function catchError(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  assert.fail("expected an error");
}

test("copies of one pipeline keep its lines", () => {
  const pipeline = parse("stages:\n  - id: a\n    run: echo\n    model: x\n");
  assert.equal(pipeline.override("description: One.").errors()[0].line, 4);
  assert.equal(pipeline.overrideStage("a", "title: Two").errors()[0].line, 4);
  assert.equal(pipeline.errors()[0].line, 4);
});
