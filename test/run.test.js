import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { UsageError } from "../dist/src/model.js";
import { compose, exitCode, prepareTask, TaskAbort } from "../dist/src/run.js";

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

test("a bad output is bad usage before any token is spent", async () => {
  await assert.rejects(prepareTask({ prompt: "x", outputs: ["a.md", "b.md"], noSession: true }, process.cwd()), UsageError);
});

test("a request with no session gets an in-memory session", async () => {
  const options = await prepareTask({ prompt: "Do it.", outputs: [], noSession: true }, process.cwd());
  assert.equal(options.prompt, "Do it.");
  assert.equal(options.sessionId, null);
  assert.equal(options.sessionManager.isPersisted(), false);
});

test("TESTEIYA_SESSION_FILE is a fallback, never an override", async () => {
  process.env.TESTEIYA_SESSION_FILE = join(mkdtempSync(join(tmpdir(), "tt-")), "env.jsonl");
  const named = join(mkdtempSync(join(tmpdir(), "tt-")), "named.jsonl");
  const options = await prepareTask({ prompt: "x", outputs: [], sessionFile: named }, process.cwd());
  const fallback = await prepareTask({ prompt: "x", outputs: [] }, process.cwd());
  const env = process.env.TESTEIYA_SESSION_FILE;
  delete process.env.TESTEIYA_SESSION_FILE;
  assert.equal(options.sessionManager.getSessionFile(), named);
  assert.equal(fallback.sessionManager.getSessionFile(), env);
});

const stubSession = () => ({ aborted: 0, async abort() { this.aborted++; } });

test("an abort while watched stops the session and names the reason", () => {
  const session = stubSession();
  const controller = new AbortController();
  const abort = new TaskAbort(session, controller.signal);
  abort.watch();
  assert.equal(abort.reason, null);
  controller.abort("timeout");
  assert.equal(session.aborted, 1);
  assert.equal(abort.reason, "ran past its timeout");
});

test("an abort after release leaves the session alone", () => {
  const session = stubSession();
  const controller = new AbortController();
  const abort = new TaskAbort(session, controller.signal);
  abort.watch();
  abort.release();
  controller.abort("interrupted");
  assert.equal(session.aborted, 0);
  assert.equal(abort.reason, "interrupted");
});

test("a run with no signal is never aborted", () => {
  const abort = new TaskAbort(stubSession());
  abort.watch();
  assert.equal(abort.reason, null);
});
