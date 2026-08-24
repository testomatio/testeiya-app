import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { expandSkills } from "../dist/src/skills.js";

const dir = mkdtempSync(join(tmpdir(), "testeiya-skills-"));
const skills = [skill("qa-thinking", "Think like QA."), skill("qa-write-test-cases", "Write cases.")];

test("a named skill is loaded in front of the task", () => {
  const { prompt, loaded } = expandSkills("review this pr /qa-thinking", skills);
  assert.deepEqual(loaded, ["qa-thinking"]);
  assert.match(prompt, /^<skill name="qa-thinking"/);
  assert.ok(prompt.includes("Think like QA."));
  assert.ok(prompt.endsWith("review this pr /qa-thinking"));
  assert.ok(!prompt.includes("description:"));
});

test("a name we do not ship is left alone", () => {
  const { prompt, loaded } = expandSkills("/testeiya what about the retry path?", skills);
  assert.deepEqual(loaded, []);
  assert.equal(prompt, "/testeiya what about the retry path?");
});

test("punctuation, the skill: prefix and repeats all resolve to one skill", () => {
  const task = "use /skill:qa-thinking, then /qa-thinking. and /qa-write-test-cases";
  const { loaded } = expandSkills(task, skills);
  assert.deepEqual(loaded, ["qa-thinking", "qa-write-test-cases"]);
});

test("a path or url that contains a skill name is not a mention", () => {
  const { loaded } = expandSkills("see skills/qa-thinking/SKILL.md and https://x.io/qa-thinking", skills);
  assert.deepEqual(loaded, []);
});

function skill(name, body) {
  const baseDir = join(dir, name);
  mkdirSync(baseDir, { recursive: true });
  const filePath = join(baseDir, "SKILL.md");
  writeFileSync(filePath, `---\nname: ${name}\ndescription: ${body}\n---\n\n${body}\n`);
  return { name, description: body, filePath, baseDir, sourceInfo: {}, disableModelInvocation: false };
}
