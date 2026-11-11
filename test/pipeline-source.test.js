import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  BUILTIN_VARIABLES,
  BUNDLED_PIPELINES,
  PIPELINE_TARGETS,
  PipelineError,
  PipelineSource,
} from "testeiya/pipeline";
import { Overlay } from "../dist/src/pipeline/overlay.js";
import { Variables } from "../dist/src/pipeline/variables.js";
import { UsageError } from "../dist/src/model.js";

const ROOT = join(import.meta.dirname, "..");

function inputs(name) {
  const { inputs } = new PipelineSource(BUNDLED_PIPELINES[name], { name }).describe();
  return inputs;
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

test("the bundled pipelines are data, keyed by file name", () => {
  assert.deepEqual(Object.keys(BUNDLED_PIPELINES).sort(), ["api-testing", "issue-test-cases", "pr-review", "regression", "web-testing"]);
  assert.equal(BUNDLED_PIPELINES.regression, readFileSync(join(ROOT, "pipelines", "regression.yml"), "utf8"));
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
  assert.deepEqual(new PipelineSource(text).describe().inputs.map((input) => input.name), ["ALPHA", "MID", "ZED"]);
});

test("a secret prerequisite marks its variables secret", () => {
  const description = new PipelineSource(BUNDLED_PIPELINES["regression"], { name: "regression" }).describe();
  assert.equal(description.inputs.find((input) => input.name === "TESTOMATIO").secret, true);
  assert.equal(description.inputs.find((input) => input.name === "TEST_COMMAND").secret, false);
  assert.equal(description.prerequisites.find((gate) => gate.name === "testomatio").secret, true);
  const auth = new PipelineSource(BUNDLED_PIPELINES["api-testing"]).describe().inputs.find((input) => input.name === "EXPLORBOT_AUTH");
  assert.equal(auth.secret, true);
  assert.throws(() => new PipelineSource("prerequisites:\n  a:\n    env: [A]\n    secret: yes please\n    message: m\nstages:\n  - id: x\n    run: echo\n").spec(), /secret must be true or false/);
  assert.throws(() => new PipelineSource("prerequisites:\n  a:\n    file: [x]\n    secret: true\n    message: m\nstages:\n  - id: x\n    run: echo\n").spec(), /secret hides env variables/);
});

test("prerequisites are described by scope and the checks a UI cannot set", () => {
  const { prerequisites } = new PipelineSource(BUNDLED_PIPELINES.regression, { name: "regression" }).describe();
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
  const unused = new PipelineSource("prerequisites:\n  x:\n    env: [X]\n    message: m\nstages:\n  - id: a\n    run: echo\n").describe();
  assert.equal(unused.prerequisites[0].scope, "unused");
  assert.deepEqual(unused.inputs.map((input) => [input.name, input.required, input.unlocks]), [["X", false, []]]);
});

test("stages are described for a UI", () => {
  const description = new PipelineSource(BUNDLED_PIPELINES["api-testing"], { name: "api-testing" }).describe();
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
  assert.deepEqual(new PipelineSource(text).describe().inputs.map((input) => [input.name, input.default]), [
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
  const err = catchError(() => new PipelineSource(text).spec());
  assert.ok(err instanceof PipelineError);
  assert.ok(err instanceof UsageError);
  assert.equal(err.message, 'stage "two" when names prerequisite "staging", which prerequisites does not define');
  assert.equal(err.key, "stages[1].when");
  assert.equal(err.line, 7);

  const gate = catchError(() => new PipelineSource("prerequisites:\n  staging:\n    env: [A]\nstages:\n  - id: a\n    run: echo\n").spec());
  assert.equal(gate.key, "prerequisites.staging");
  assert.equal(gate.line, 2);

  const syntax = catchError(() => new PipelineSource("stages:\n  - id: a\n    run: [echo\n").spec());
  assert.ok(syntax instanceof PipelineError);
  assert.equal(typeof syntax.line, "number");

  const unknown = catchError(() => new PipelineSource("stages:\n  - id: a\n    run: echo\n    model: x\n").spec());
  assert.equal(unknown.key, "stages[0].model");
  assert.equal(unknown.line, 4);
});

test("extends asks the resolver for the text, and a loop is an error", () => {
  const resolve = (name) => BUNDLED_PIPELINES[name];
  const child = "extends: issue-test-cases\nstages:\n  - id: requirements\n    append_task: Be brief.\n";
  const spec = new PipelineSource(child, { name: "mine", resolve }).spec();
  assert.equal(spec.name, "issue-test-cases");
  assert.match(spec.stages[0].task, /\nBe brief\.$/);
  assert.doesNotMatch(new PipelineSource(child, { resolve }).text(), /extends/);
  assert.throws(() => new PipelineSource("extends: nope\n", { resolve }).spec(), /no pipeline "nope" to extend/);
  const loop = { a: "extends: b\n", b: "extends: a\n" };
  assert.throws(() => new PipelineSource(loop.a, { name: "a", resolve: (name) => loop[name] }).spec(), /loops back to itself/);
});

test("text applies overlays and keeps the name the caller gave", () => {
  const source = new PipelineSource("stages:\n  - id: a\n    task: Do it.\n", { name: "agent" });
  const text = source.text([Overlay.stage("a:append_task: Be brief.")]);
  const spec = new PipelineSource(text).spec();
  assert.equal(spec.name, "agent");
  assert.equal(spec.stages[0].task, "Do it.\nBe brief.");
  const err = catchError(() => source.spec([Overlay.stage("nope:append_task: x")]));
  assert.ok(err instanceof PipelineError);
  assert.match(err.message, /^--stage nope: there is no stage "nope" to change/);
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
