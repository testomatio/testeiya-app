import assert from "node:assert/strict";
import { test } from "node:test";
import { compose, exitCode } from "../dist/src/run.js";

test("a negative verdict fails the command", () => {
  assert.equal(exitCode(null, "fail", false, null), 1);
  assert.equal(exitCode(null, "pass", false, null), 0);
});

test("--exit-zero forgives the verdict, not a broken run", () => {
  assert.equal(exitCode(null, "fail", false, null, true), 0);
  assert.equal(exitCode(null, undefined, true, null, true), 0);
  assert.equal(exitCode("the model request failed", "pass", false, null, true), 1);
});

test("an empty reply leaves the task alone", () => {
  assert.equal(compose("review this pr"), "review this pr");
  assert.equal(compose("review this pr", null, ""), "review this pr");
  assert.equal(compose("review this pr", null, "  \n "), "review this pr");
});

test("a reply is added under the task", () => {
  const prompt = compose("review this pr", null, "/testeiya also check the login flow");
  assert.match(prompt, /^review this pr/);
  assert.match(prompt, /User replied:/);
  assert.match(prompt, /<user_reply>\n\/testeiya also check the login flow\n<\/user_reply>/);
  assert.match(prompt, /The task above stands\.$/);
});

test("a reply on its own is the whole task", () => {
  const prompt = compose("", null, "is the checkout suite covered?");
  assert.match(prompt, /^User replied:/);
  assert.match(prompt, /is the checkout suite covered\?/);
  assert.doesNotMatch(prompt, /task above/);
});

test("an update is read between the task and the reply", () => {
  const prompt = compose("review this pr", "Since your last round:\n\n- moved", "and the login flow?");
  assert.match(prompt, /^review this pr\n\nSince your last round:/);
  assert.ok(prompt.indexOf("- moved") < prompt.indexOf("User replied:"));
  assert.match(prompt, /The task above stands\.$/);
});

test("an update with no reply is still delivered", () => {
  const prompt = compose("review this pr", "Since your last round:\n\n- moved");
  assert.equal(prompt, "review this pr\n\nSince your last round:\n\n- moved");
});
