import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { BUILTIN_VARIABLES, PIPELINE_TARGETS, Pipeline, PipelineError, Pipelines } from "testeiya/pipeline";
import { Variables } from "../dist/src/pipeline/variables.js";
import { UsageError } from "../dist/src/model.js";

const ROOT = join(import.meta.dirname, "..");

const pipelines = new Pipelines();
const parse = (yaml, options) => pipelines.parse(yaml, options);

function inputs(name) {
  return pipelines.open(name).inputs();
}

/** The table in the spec: required, then what each unlocking input unlocks, then the optional rest. */
function table(name) {
  const list = inputs(name);
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
  assert.deepEqual(pipelines.names(), ["api-testing", "issue-test-cases", "pr-review", "regression", "web-testing"]);
  assert.equal(pipelines.open("regression").source, readFileSync(join(ROOT, "pipelines", "regression.yml"), "utf8"));
  assert.ok(pipelines.open("regression") instanceof Pipeline);
  assert.equal(pipelines.has("regression"), true);
  assert.equal(pipelines.has("nope"), false);
  assert.throws(() => pipelines.open("nope"), (err) => err instanceof PipelineError && err.message === 'no pipeline "nope"');
});

test("regression: a file check at the top, inputs only unlock stages", () => {
  assert.deepEqual(table("regression"), {
    order: ["TESTOMATIO", "TEST_COMMAND", "BASE_BRANCH", "REMOTE"],
    required: [],
    unlocks: { TESTOMATIO: ["tests"], TEST_COMMAND: ["failures"] },
    optional: { BASE_BRANCH: "origin/main", REMOTE: undefined },
  });
});

test("issue-test-cases: the issue is required", () => {
  assert.deepEqual(table("issue-test-cases"), {
    order: ["ISSUE_URL", "TESTOMATIO"],
    required: ["ISSUE_URL"],
    unlocks: { TESTOMATIO: ["sync"] },
    optional: {},
  });
  const [issue] = inputs("issue-test-cases");
  assert.equal(issue.message, "No issue. Set ISSUE_URL to the issue or epic to cover.");
  assert.deepEqual(issue.prerequisites, ["issue"]);
  assert.deepEqual(issue.usedIn, ["prerequisite", "env", "task"]);
});

test("pr-review: GIT_BRANCH and ITEM are the runner's", () => {
  assert.deepEqual(table("pr-review"), {
    order: ["CREATE_TESTCASES", "TESTOMATIO"],
    required: [],
    unlocks: { CREATE_TESTCASES: ["test-cases", "sync"], TESTOMATIO: ["sync"] },
    optional: {},
  });
});

test("web-testing: a default that reads another variable is no default", () => {
  assert.deepEqual(table("web-testing"), {
    order: ["EXPLORBOT_URL", "EXPLORBOT_AI_PROVIDER", "EXPLORBOT_VERSION", "PLAYWRIGHT_BROWSERS_PATH"],
    required: [],
    unlocks: { EXPLORBOT_URL: ["write-plan", "explore", "results"], EXPLORBOT_AI_PROVIDER: ["explore", "results"] },
    optional: { EXPLORBOT_VERSION: "latest", PLAYWRIGHT_BROWSERS_PATH: undefined },
  });
});

test("api-testing: a variable the command assigns is not an input", () => {
  assert.deepEqual(table("api-testing"), {
    order: ["EXPLORBOT_URL", "OPENAPI_SPEC", "EXPLORBOT_AUTH", "EXPLORBOT_AI_PROVIDER", "EXPLORBOT_VERSION"],
    required: [],
    unlocks: {
      EXPLORBOT_URL: ["spec", "review", "explore"],
      OPENAPI_SPEC: ["spec", "review", "explore"],
      EXPLORBOT_AUTH: ["review"],
      EXPLORBOT_AI_PROVIDER: ["explore"],
    },
    optional: { EXPLORBOT_VERSION: "latest" },
  });
});

test("the optional rest is sorted by name", () => {
  const text = "env:\n  A: ${ZED}\n  B: ${ALPHA}\nstages:\n  - id: one\n    run: echo $MID\n";
  assert.deepEqual(parse(text).describe().inputs.map((input) => input.name), ["ALPHA", "MID", "ZED"]);
});

test("a secret prerequisite marks its variables secret", () => {
  const description = pipelines.open("regression").describe();
  assert.equal(description.inputs.find((input) => input.name === "TESTOMATIO").secret, true);
  assert.equal(description.inputs.find((input) => input.name === "TEST_COMMAND").secret, false);
  assert.equal(description.prerequisites.find((gate) => gate.name === "testomatio").secret, true);
  const auth = pipelines.open("api-testing").describe().inputs.find((input) => input.name === "EXPLORBOT_AUTH");
  assert.equal(auth.secret, true);
  assert.throws(() => parse("prerequisites:\n  a:\n    env: [A]\n    secret: yes please\n    message: m\nstages:\n  - id: x\n    run: echo\n").spec(), /secret must be true or false/);
  assert.throws(() => parse("prerequisites:\n  a:\n    file: [x]\n    secret: true\n    message: m\nstages:\n  - id: x\n    run: echo\n").spec(), /secret hides env variables/);
});

test("prerequisites are described by scope and the checks a UI cannot set", () => {
  const { prerequisites } = pipelines.open("regression").describe();
  assert.deepEqual(prerequisites.find((gate) => gate.name === "coverage"), {
    name: "coverage",
    message: "No coverage.tests.yml. Create one with /qa-test-code-coverage to run only affected tests.",
    scope: "run",
    stages: [],
    env: [],
    checks: ["file"],
    secret: false,
  });
  assert.deepEqual(prerequisites.find((gate) => gate.name === "local").checks, ["run"]);
  assert.deepEqual(prerequisites.find((gate) => gate.name === "test-command").stages, ["failures"]);
  const unused = parse("prerequisites:\n  x:\n    env: [X]\n    message: m\nstages:\n  - id: a\n    run: echo\n").describe();
  assert.equal(unused.prerequisites[0].scope, "unused");
  assert.deepEqual(unused.inputs.map((input) => [input.name, input.required, input.unlocks]), [["X", false, []]]);
});

test("stages are described for a UI", () => {
  const description = pipelines.open("api-testing").describe();
  assert.equal(description.name, "api-testing");
  assert.equal(description.target, "pr");
  const explore = description.stages.find((stage) => stage.id === "explore");
  assert.equal(explore.kind, "run");
  assert.match(explore.text, /^EXPLORBOT_OUTPUT=/);
  assert.deepEqual(explore.loop, { each_line: "endpoints.txt" });
  assert.deepEqual(explore.when, ["api", "explorbot-ai"]);
  assert.equal(description.stages.find((stage) => stage.id === "review").session, "qa");
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

test("the runner's own variables are listed", () => {
  assert.deepEqual([...BUILTIN_VARIABLES].sort(), [
    "GIT_BRANCH", "ITEM", "ITEM_NAME", "PIPELINE_DIR", "PIPELINE_NAME", "PIPELINE_RESUME", "PIPELINE_ROUND", "STAGE_DIR",
  ]);
  assert.deepEqual(PIPELINE_TARGETS, ["pr", "issue", "daily-cron", "weekly-cron"]);
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
  assert.deepEqual(pipelines.list().find((pipeline) => pipeline.name === "regression"), {
    name: "regression",
    description: "Run the tests a change can break, from the coverage map, then explain the failures.",
    target: "pr",
    bundled: true,
    valid: true,
  });
  assert.deepEqual(pipelines.list().map((pipeline) => pipeline.name), pipelines.names());
  const own = new Pipelines({
    nightly: "description: Ours.\ntarget: daily-cron\nstages:\n  - id: a\n    run: echo\n",
    broken: "stages: nope\n",
    regression: "extends: regression\ndescription: Ours too.\n",
  });
  const list = own.list();
  assert.deepEqual(list.map((pipeline) => pipeline.name), ["api-testing", "broken", "issue-test-cases", "nightly", "pr-review", "regression", "web-testing"]);
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

test("the bundled sync stages loop over the test case files", () => {
  for (const name of ["pr-review", "issue-test-cases"]) {
    const sync = pipelines.open(name).spec().stages.find((stage) => stage.id === "sync");
    assert.equal(sync.each_file, "test-cases/*.md", name);
  }
});

test("bundled prerequisite names are dash slugs, like stage ids", () => {
  for (const name of pipelines.names()) {
    for (const gate of Object.keys(pipelines.open(name).spec().prerequisites)) assert.match(gate, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${name}: ${gate}`);
  }
});

test("copies of one pipeline keep its lines", () => {
  const pipeline = parse("stages:\n  - id: a\n    run: echo\n    model: x\n");
  assert.equal(pipeline.override("description: One.").errors()[0].line, 4);
  assert.equal(pipeline.overrideStage("a", "title: Two").errors()[0].line, 4);
  assert.equal(pipeline.errors()[0].line, 4);
  assert.equal(pipeline.errors()[0].line, 4);
});
