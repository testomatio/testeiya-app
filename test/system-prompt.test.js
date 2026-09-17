import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "../dist/prompt/system-prompt.js";
import { briefAnswer, finalReport, report, verdict } from "../dist/prompt/report.js";
import { testomatio } from "../dist/prompt/testomat.io.js";
import { commentThread, thread } from "../dist/prompt/thread.js";
import { marker } from "../dist/src/output.js";

const MARKER = marker({ thread: "qa-review", commit: "700fbe1d9c" });

const worker = (extra = {}) => buildSystemPrompt({ cwd: "/work/app", tms: "cli-only", ...extra });

test("system-prompt composes thread, testomat.io, sections and the report contract", () => {
  const prompt = worker({
    connected: true,
    outputFile: "/tmp/report.md",
    sections: ["<comment-thread>x</comment-thread>"],
  });
  const order = ["<role>", "<trigger-run>", "<workspace>", "<connections>", "<testomatio>", "<comment-thread>x", "<final-report>"];
  const positions = order.map((tag) => prompt.indexOf(tag));
  assert.ok(positions.every((p) => p >= 0), "every section is present");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test("a trigger run knows its input shape and working order", () => {
  const prompt = worker();
  assert.match(prompt, /one-shot run fired by a trigger/);
  assert.match(prompt, /pull request, an issue, a chat request/);
  assert.match(prompt, /The task.*<user_reply>/s);
  assert.match(prompt, /start the task directly/);
  assert.match(prompt, /Investigate read-first/);
});

test("a standalone run states it is the first and only message", () => {
  const prompt = worker();
  assert.match(prompt, /first and only message of the run/);
  assert.match(prompt, /no earlier round, no thread history/);
  assert.match(prompt, /no "Since your last round" to catch up on/);
  assert.match(prompt, /There is nothing to catch up on/);
  assert.doesNotMatch(prompt, /Catch up first/);
  assert.doesNotMatch(prompt, /later round in a thread/);
});

test("a first thread round says the thread opens with this answer", () => {
  const prompt = worker({ threadMode: "first" });
  assert.match(prompt, /first message in this thread/);
  assert.match(prompt, /no earlier answer of yours exists there/);
  assert.match(prompt, /Later rounds will continue from what you write now/);
  assert.match(prompt, /There is nothing to catch up on/);
  assert.doesNotMatch(prompt, /Catch up first/);
  assert.doesNotMatch(prompt, /Since your last round.*below/s);
});

test("a continuing thread round points at the catch-up section", () => {
  const prompt = worker({ threadMode: "continuing" });
  assert.match(prompt, /later round in a thread/);
  assert.match(prompt, /"Since your last round" below/);
  assert.match(prompt, /read it before anything else/);
  assert.match(prompt, /never repeat an answer that is still visible in the thread/);
  assert.match(prompt, /Catch up first/);
  assert.doesNotMatch(prompt, /first message in this thread/);
  assert.doesNotMatch(prompt, /start the task directly/);
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

test("the prompt reads role, trigger, workspace, tools, connections, Testomat.io, then the answer", () => {
  const prompt = worker({ connected: true, outputFile: "/tmp/report.md" });
  assert.doesNotMatch(prompt, /<rules>/);
  const order = ["<role>", "<trigger-run>", "<workspace>", "<available-tools>", "<connections>", "<testomatio>", "<final-report>"];
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
  assert.match(prompt, /a blocker, not a question/);
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

test("the report module composes the brief answer, the report contract and the verdict", () => {
  assert.deepEqual(report({ outputFile: "/tmp/r.md" }), [finalReport("/tmp/r.md")]);
  assert.deepEqual(report({ brief: true }), [briefAnswer]);
  assert.deepEqual(report({}), []);
  assert.match(finalReport("/tmp/r.md"), /<final-report>/);
  assert.match(briefAnswer, /<answer>/);
  assert.match(verdict, /silence means success/);
});

test("the testomat.io module renders the domain rules for every access mode", () => {
  assert.match(testomatio({ tms: "mcp-proxy", connected: true }), /<testomatio>/);
  assert.match(testomatio({ tms: "cli-only", connected: true }), /\/api\/v2/);
  assert.match(testomatio({ tms: "mcp-direct", connected: true }), /testomatio-<slug>/);
  const unconnected = testomatio({ tms: "cli-only" });
  assert.doesNotMatch(unconnected, /<testomatio>/);
  assert.match(unconnected, /<testomatio-connection>/);
  assert.match(testomatio({ tms: "cli-only", connected: true, backendUrl: "https://app.testomat.io" }), /https:\/\/app\.testomat\.io/);
});

test("the thread module composes the task, the trigger lifecycle and the run state", () => {
  for (const threadMode of ["first", "continuing", undefined]) {
    const text = thread({ threadMode });
    assert.match(text, /<user_reply>/);
    if (threadMode) assert.match(text, /new PR commits or replies trigger separate one-shot messages/);
    else assert.doesNotMatch(text, /new PR commits or replies trigger separate one-shot messages/);
  }
  assert.match(thread({ threadMode: "continuing" }), /Catch up first/);
  assert.match(thread({ threadMode: "first" }), /Later rounds will continue from what you write now/);
  assert.match(thread({}), /first and only message of the run/);
});

test("the comment-thread module carries the marker and the state", () => {
  const text = commentThread({ host: "github", thread: "qa-review", marker: MARKER, threadMode: "continuing" });
  assert.match(text, /<comment-thread>/);
  assert.ok(text.includes(MARKER));
  assert.match(text, /Since the last round/);
});

test("the manual-tests hint can be switched off", () => {
  assert.match(worker(), /before declaring the project has no manual tests/);
  assert.doesNotMatch(worker({ manualTestsHint: false }), /before declaring the project has no manual tests/);
});
