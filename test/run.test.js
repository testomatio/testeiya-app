import assert from "node:assert/strict";
import { test } from "node:test";
import { exitCode } from "../dist/src/run.js";

test("a negative verdict fails the command", () => {
  assert.equal(exitCode(null, "fail", false, null), 1);
  assert.equal(exitCode(null, "pass", false, null), 0);
});

test("--exit-zero forgives the verdict, not a broken run", () => {
  assert.equal(exitCode(null, "fail", false, null, true), 0);
  assert.equal(exitCode(null, undefined, true, null, true), 0);
  assert.equal(exitCode("the model request failed", "pass", false, null, true), 1);
});
