import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "../dist/prompt/system-prompt.js";

const worker = (extra = {}) => buildSystemPrompt({ cwd: "/work/app", tms: "cli-only", ...extra });

test("a trigger run knows its input shape and working order", () => {
  const prompt = worker();
  assert.match(prompt, /one-shot run fired by a trigger/);
  assert.match(prompt, /pull request, an issue, a chat request/);
  assert.match(prompt, /The task.*Since your last round.*<user_reply>/s);
  assert.match(prompt, /Catch up first/);
  assert.match(prompt, /Investigate read-first/);
});

test("a trigger run disciplines the verdict", () => {
  const prompt = worker();
  assert.match(prompt, /silence means success/);
  assert.match(prompt, /set_result/);
  assert.match(prompt, /advisory review.*passes/s);
  assert.match(prompt, /Blockers are the headline/);
});

test("a trigger run defaults to read-only and never waits", () => {
  const prompt = worker();
  assert.match(prompt, /Default to read-only/);
  assert.match(prompt, /Do not commit, push/);
  assert.match(prompt, /Never wait for input/);
  assert.match(prompt, /Do not launch or drive a browser/);
  assert.match(prompt, /Never end the run with nothing/);
  assert.match(prompt, /decide yourself and state the assumption/);
  assert.match(prompt, /there is no one to ask/);
});

test("the prompt reads role, trigger, workspace, tools, rules, Testomat.io, then the answer", () => {
  const prompt = worker({ connected: true, outputFile: "/tmp/report.md" });
  const order = ["<role>", "<trigger-run>", "<workspace>", "<available-tools>", "<rules>", "<testomatio>", "<final-report>"];
  const positions = order.map((tag) => prompt.indexOf(tag));
  assert.ok(positions.every((p) => p >= 0), "every section is present");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test("the worker prompt has no interactive habits", () => {
  const prompt = worker({ connected: true });
  assert.doesNotMatch(prompt, /Lead with intent/);
  assert.doesNotMatch(prompt, /Ask for clarification/);
  assert.doesNotMatch(prompt, /ask_question/);
  assert.doesNotMatch(prompt, /Settings/);
  assert.doesNotMatch(prompt, /playwright/);
  assert.doesNotMatch(prompt, /ask for it/);
  assert.match(prompt, /report it as a blocker/);
});

test("Testomat.io access is worded for the way this run reaches it", () => {
  const proxy = worker({ tms: "mcp-proxy", connected: true });
  assert.match(proxy, /`mcp` tool/);
  assert.doesNotMatch(proxy, /testomatio-<slug>/);
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

test("test counting is scoped to workspaces that hold suites and points at the skill", () => {
  const prompt = worker({ connected: true });
  assert.match(prompt, /only when the workspace actually holds `\*\.test\.md` suites/);
  assert.match(prompt, /In a source checkout with no such files there is nothing to count/);
  assert.match(prompt, /scan-automation-project/);
  assert.doesNotMatch(prompt, /awk/);
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
});

test("the manual-tests hint can be switched off", () => {
  assert.match(worker(), /before declaring the project has no manual tests/);
  assert.doesNotMatch(worker({ manualTestsHint: false }), /before declaring the project has no manual tests/);
});
