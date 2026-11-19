import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "../dist/prompt/system-prompt.js";
import { briefAnswer, finalReport, report, verdict } from "../dist/prompt/report.js";
import { testomatio } from "../dist/prompt/testomat.io.js";

const worker = (extra = {}) => buildSystemPrompt({ cwd: "/work/app", tms: "cli-only", ...extra });

test("each thread mode opens the run its own way", () => {
  assert.match(worker(), /first and only message of the run/);
  assert.match(worker({ threadMode: "first" }), /first message in this thread/);
  assert.match(worker({ threadMode: "continuing" }), /Catch up first/);
  for (const threadMode of [undefined, "first"]) assert.doesNotMatch(worker({ threadMode }), /Catch up first/);
});

test("a trigger run carries the verdict rules, stays read-only and never asks", () => {
  const prompt = worker({ connected: true });
  assert.ok(prompt.includes(verdict));
  assert.match(prompt, /Default to read-only/);
  assert.match(prompt, /Never wait for input/);
  assert.doesNotMatch(prompt, /ask_question/);
});

test("Testomat.io access is worded for the way this run reaches it", () => {
  const tools = worker({ tms: "mcp-tools", connected: true });
  assert.match(tools, /mcp__testomatio__/);
  assert.doesNotMatch(tools, /testomatio-<slug>/);
  const cli = worker({ tms: "cli-only", connected: true });
  assert.match(cli, /\/api\/v2/);
  assert.doesNotMatch(cli, /MCP tools, one set/);
  assert.match(cli, /check-tests/);
});

test("an unconnected worker reports the gap instead of pointing at the app", () => {
  const prompt = worker();
  assert.match(prompt, /not linked to a Testomat.io project/);
  assert.match(prompt, /report it as a blocker in your output/);
  assert.doesNotMatch(prompt, /<testomatio>/);
});

test("test counting points at the skill", () => {
  assert.match(worker({ connected: true }), /scan-automation-project/);
});

test("the run's own sections land between the domain rules and the answer", () => {
  const prompt = worker({ sections: ["<comment-thread>x</comment-thread>"], outputFile: "/tmp/r.md" });
  const thread = prompt.indexOf("<comment-thread>x");
  assert.ok(thread > prompt.indexOf("<testomatio-connection>"));
  assert.ok(thread < prompt.indexOf("<final-report>"));
});

test("the report contract points thread rounds at the thread rules", () => {
  const prompt = worker({ outputFile: "/tmp/report.md" });
  assert.match(prompt, /<final-report>/);
  assert.match(prompt, /\/tmp\/report\.md/);
  assert.match(prompt, /<comment-thread>\) the file is the whole current answer, never a delta/);
});

test("a brief answer replaces the report", () => {
  const prompt = worker({ brief: true });
  assert.ok(prompt.endsWith("</answer>"));
  assert.doesNotMatch(prompt, /<final-report>/);
  assert.deepEqual(report({ outputFile: "/tmp/r.md" }), [finalReport("/tmp/r.md")]);
  assert.deepEqual(report({ brief: true }), [briefAnswer]);
  assert.deepEqual(report({}), []);
});

test("the testomat.io module renders the domain rules for every access mode", () => {
  assert.match(testomatio({ tms: "mcp-tools", connected: true }), /<testomatio>/);
  assert.match(testomatio({ tms: "cli-only", connected: true }), /\/api\/v2/);
  assert.match(testomatio({ tms: "mcp-direct", connected: true }), /testomatio-<slug>/);
  const unconnected = testomatio({ tms: "cli-only" });
  assert.doesNotMatch(unconnected, /<testomatio>/);
  assert.match(unconnected, /<testomatio-connection>/);
  assert.match(testomatio({ tms: "cli-only", connected: true, backendUrl: "https://app.testomat.io" }), /https:\/\/app\.testomat\.io/);
});

test("the manual-tests hint can be switched off", () => {
  assert.match(worker(), /before declaring the project has no manual tests/);
  assert.doesNotMatch(worker({ manualTestsHint: false }), /before declaring the project has no manual tests/);
});
