import assert from "node:assert/strict";
import { test } from "node:test";
import langfuseExtension from "../dist/src/langfuse-extension.js";
import { langfuseConfig } from "../dist/src/langfuse.js";

test("tracing stays off until both keys are set", () => {
  assert.equal(langfuseConfig({ LANGFUSE_PUBLIC_KEY: "pk" }), null);
  assert.equal(langfuseConfig({ LANGFUSE_SECRET_KEY: "sk" }), null);

  const cloud = langfuseConfig({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" });
  assert.equal(cloud.baseUrl, "https://cloud.langfuse.com");

  const own = langfuseConfig({
    LANGFUSE_PUBLIC_KEY: "pk",
    LANGFUSE_SECRET_KEY: "sk",
    LANGFUSE_BASE_URL: "http://localhost:3001/",
  });
  assert.equal(own.baseUrl, "http://localhost:3001");
});

test("a run is one trace: an agent root, its generation and its tool", async () => {
  const posted = await runOnce();

  assert.equal(posted.url, "http://localhost:3001/api/public/otel/v1/traces");
  assert.equal(posted.init.headers.authorization, `Basic ${Buffer.from("pk:sk").toString("base64")}`);

  const spans = JSON.parse(posted.init.body).resourceSpans[0].scopeSpans[0].spans;
  const root = spans.find((span) => !span.parentSpanId);
  const generation = spans.find((span) => attr(span, "langfuse.observation.type") === "generation");
  const tool = spans.find((span) => attr(span, "langfuse.observation.type") === "tool");

  assert.equal(spans.length, 3);
  assert.equal(root.name, "check the login page");
  assert.equal(attr(root, "langfuse.observation.type"), "agent");
  assert.equal(attr(root, "langfuse.trace.name"), "check the login page");
  assert.equal(attr(root, "langfuse.trace.output"), "all good");
  assert.equal(attr(root, "langfuse.session.id"), "session-1");
  assert.deepEqual(JSON.parse(attr(root, "langfuse.trace.tags")), ["testeiya", "cli"]);
  assert.equal(JSON.parse(attr(root, "langfuse.trace.metadata")).model, "openrouter/some-model");

  assert.equal(generation.parentSpanId, root.spanId);
  assert.equal(generation.traceId, root.traceId);
  assert.equal(attr(generation, "langfuse.observation.model.name"), "some-model");
  assert.equal(JSON.parse(attr(generation, "langfuse.observation.usage_details")).total, 30);
  assert.equal(JSON.parse(attr(generation, "langfuse.observation.cost_details")).total, 0.03);

  assert.equal(tool.name, "bash");
  assert.equal(tool.parentSpanId, root.spanId);
  assert.equal(attr(tool, "langfuse.observation.level"), "ERROR");
});

test("a task that names a skill is still traced under the task", async () => {
  const prompt = `<skill name="qa-thinking" location="/skills/qa-thinking/SKILL.md">\nThink like a QA.\n</skill>\n\nReview this pull request /qa-thinking`;
  const posted = await runOnce(prompt);
  const spans = JSON.parse(posted.init.body).resourceSpans[0].scopeSpans[0].spans;
  const root = spans.find((span) => !span.parentSpanId);

  assert.equal(root.name, "Review this pull request /qa-thinking");
  assert.equal(attr(root, "langfuse.observation.input"), prompt);
});

test("a run with no keys posts nothing", async () => {
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  const handlers = {};
  langfuseExtension({ on: (event, fn) => (handlers[event] = fn) });

  assert.deepEqual(Object.keys(handlers), []);
});

async function runOnce(prompt = "check the login page") {
  process.env.LANGFUSE_PUBLIC_KEY = "pk";
  process.env.LANGFUSE_SECRET_KEY = "sk";
  process.env.LANGFUSE_BASE_URL = "http://localhost:3001";

  const handlers = {};
  langfuseExtension({ on: (event, fn) => (handlers[event] = fn) });

  let posted;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    posted = { url, init };
    return { ok: true, status: 200 };
  };

  const ctx = { cwd: "/work", model: { provider: "openrouter", id: "some-model" }, sessionManager: { getSessionId: () => "session-1" } };
  const assistant = {
    role: "assistant",
    model: "some-model",
    content: [{ type: "text", text: "all good" }],
    usage: {
      input: 20,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 30,
      cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
    },
  };

  handlers.before_agent_start({ prompt }, ctx);
  handlers.context({ messages: [{ role: "user", content: prompt }] });
  handlers.message_start({ message: assistant });
  handlers.tool_execution_start({ toolCallId: "call-1", toolName: "bash", args: { cmd: "ls" } });
  handlers.tool_execution_end({ toolCallId: "call-1", result: "boom", isError: true });
  handlers.message_end({ message: assistant });
  handlers.agent_end({ messages: [assistant] });
  await handlers.agent_settled({});

  globalThis.fetch = realFetch;
  return posted;
}

function attr(span, key) {
  return span.attributes.find((one) => one.key === key)?.value.stringValue;
}
