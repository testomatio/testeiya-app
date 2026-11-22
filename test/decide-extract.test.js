import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Decider } from "../dist/src/decision.js";
import { parseExtractFields } from "../dist/src/extract-fields.js";
import { createExtractTool } from "../dist/src/result.js";
import { resolveDecisionModel, UsageError } from "../dist/src/model.js";

test("--output values become named fields; an unnamed one is the field value", () => {
  assert.deepEqual(parseExtractFields(["url: public url of a page"]), [{ name: "url", description: "public url of a page" }]);
  assert.deepEqual(parseExtractFields(["a semver version"]), [{ name: "value", description: "a semver version" }]);
  assert.deepEqual(parseExtractFields([]), [{ name: "value", description: "the answer" }]);
  assert.match(parseExtractFields(["a", "b"]), /only one --output value can go without a name/);
  assert.match(parseExtractFields(["url: a", "url: b"]), /two --output values are called "url"/);
});

test("the extract tool keeps each value on one line", async () => {
  const result = {};
  const tool = createExtractTool(result, [{ name: "url", description: "the url" }]);
  await tool.execute("id", { url: "  https://a.example\n  (staging)  " });
  assert.deepEqual(result.values, { url: "https://a.example (staging)" });
});

test("the decision state names each file, reads folders, and takes stdin as input", () => {
  const dir = mkdtempSync(join(tmpdir(), "testeiya-decide-"));
  writeFileSync(join(dir, "report.md"), "all green");
  mkdirSync(join(dir, "logs"));
  writeFileSync(join(dir, "logs", "ci.log"), "passed");
  const state = Decider.state([join(dir, "report.md"), join(dir, "logs")], "from stdin", dir);
  assert.deepEqual(state, { "report.md": "all green", "logs/ci.log": "passed", input: "from stdin" });
  assert.throws(() => Decider.state([join(dir, "nope.md")]), UsageError);
});

test("a threshold is a probability between 0 and 1", () => {
  assert.equal(Decider.threshold("0.7"), 0.7);
  assert.equal(Decider.threshold(undefined), undefined);
  for (const bad of ["0", "1", "x", "-0.2"]) assert.throws(() => Decider.threshold(bad), UsageError);
});

test("the decision model comes from TESTEIYA_DECISION_MODEL, never TESTEIYA_MODEL", () => {
  const saved = { decision: process.env.TESTEIYA_DECISION_MODEL, model: process.env.TESTEIYA_MODEL };
  delete process.env.TESTEIYA_DECISION_MODEL;
  process.env.TESTEIYA_MODEL = "openrouter/cloudflare/clef";
  const clef = { provider: "openrouter", id: "cloudflare/clef", type: "classifier" };
  const runtime = {
    getModelOfType: (type, provider, id) => (type === "classifier" && `${provider}/${id}` === "openrouter/cloudflare/clef" ? clef : undefined),
    getModel: (provider, id) => (id === "anthropic/claude-sonnet-5" ? { provider, id } : undefined),
    hasConfiguredAuth: () => true,
  };
  try {
    assert.throws(() => resolveDecisionModel(runtime), /no decision model/);
    process.env.TESTEIYA_DECISION_MODEL = "openrouter/cloudflare/clef";
    assert.equal(resolveDecisionModel(runtime), clef);
    assert.throws(() => resolveDecisionModel(runtime, "openrouter/anthropic/claude-sonnet-5"), /it is a chat model/);
  } finally {
    for (const [key, name] of [["decision", "TESTEIYA_DECISION_MODEL"], ["model", "TESTEIYA_MODEL"]]) {
      if (saved[key] === undefined) delete process.env[name];
      else process.env[name] = saved[key];
    }
  }
});

test("the extraction prompt lists each value under the instruction", async () => {
  const { extraction } = await import("../dist/prompt/report.js");
  const text = extraction([{ name: "url", description: "public url" }, { name: "version", description: "semver" }]);
  assert.match(text, /\n  \* `url`: public url\n  \* `version`: semver\n/);
  assert.match(text, /submit_values/);
});
