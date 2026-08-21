import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCliArgs } from "../dist/src/args.js";

test("a bare prompt names the fix", () => {
  const args = parseCliArgs(["analyze our tests"]);
  assert.match(args.error, /testeiya task "analyze our tests"/);
});

test("task takes the rest as the prompt", () => {
  const args = parseCliArgs(["task", "review the checkout suite"]);
  assert.equal(args.command, "task");
  assert.equal(args.prompt, "review the checkout suite");
});

test("output is repeatable", () => {
  const args = parseCliArgs(["task", "x", "-o", "report.md", "-o", "gh:pr-comment"]);
  assert.deepEqual(args.outputs, ["report.md", "gh:pr-comment"]);
});

test("session flags", () => {
  const args = parseCliArgs(["task", "x", "-c", "--name", "nightly"]);
  assert.equal(args.continueLast, true);
  assert.equal(args.name, "nightly");
  assert.equal(args.noSession, undefined);
});

test("a task starting with a dash needs --", () => {
  const args = parseCliArgs(["task", "--", "-weird task"]);
  assert.equal(args.prompt, "-weird task");
});

test("unknown options are a usage error", () => {
  assert.match(parseCliArgs(["task", "x", "--nope"]).error, /nope/);
});

test("doctor and models keep their own options", () => {
  assert.equal(parseCliArgs(["doctor", "--probe"]).probe, true);
  assert.equal(parseCliArgs(["models", "sonnet"]).pattern, "sonnet");
  assert.match(parseCliArgs(["doctor", "--output", "x"]).error, /output/);
});

test("three help surfaces", () => {
  assert.equal(parseCliArgs([]).command, "welcome");
  assert.equal(parseCliArgs(["--help"]).command, "usage");
  assert.equal(parseCliArgs(["help"]).command, "help");
  assert.equal(parseCliArgs(["-v"]).command, "version");
});

test("ask takes the same options as task", () => {
  const args = parseCliArgs(["ask", "is this feature ready", "-c"]);
  assert.equal(args.command, "ask");
  assert.equal(args.prompt, "is this feature ready");
  assert.equal(args.continueLast, true);
});
