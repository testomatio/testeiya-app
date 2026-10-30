import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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

test("manifest resolves", () => {
  assert.ok(existsSync(fileURLToPath(import.meta.resolve("testeiya/skills/skills.yaml"))));
});
