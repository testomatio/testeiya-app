import assert from "node:assert/strict";
import { test } from "node:test";

test("prompt is exported", async () => {
  const { buildSystemPrompt } = await import("testeiya/prompt/system-prompt.js");
  const { cliRouting } = await import("testeiya/prompt/clis.js");
  assert.equal(typeof buildSystemPrompt, "function");
  assert.equal(typeof cliRouting, "function");
});

test("vendor script is exported", async () => {
  const { SkillsVendor } = await import("testeiya/scripts/vendor-skills.js");
  assert.equal(typeof SkillsVendor, "function");
});
