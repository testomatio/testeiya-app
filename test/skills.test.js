import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { expandSkills } from "../dist/src/skills.js";
import { SkillsVendor } from "../scripts/vendor-skills.js";

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

test("vendoring copies each plugin's skills into a folder named after the plugin", async () => {
  const out = mkdtempSync(join(tmpdir(), "vendor-"));
  mkdirSync(join(out, "stale"));
  await new SkillsVendor({ outputDir: out, repo: skillsRepo() }).update();
  assert.deepEqual(readdirSync(out).sort(), ["qa-process", "test-management"]);
  assert.deepEqual(readdirSync(join(out, "test-management")).sort(), ["qa-thinking", "sync-cases"]);
  assert.ok(existsSync(join(out, "test-management", "qa-thinking", "SKILL.md")));
  assert.ok(existsSync(join(out, "test-management", "qa-thinking", "refs", "notes.md")));
});

test("a skill listed by two plugins lands in the first one only", async () => {
  const out = mkdtempSync(join(tmpdir(), "vendor-"));
  await new SkillsVendor({ outputDir: out, repo: skillsRepo() }).update();
  assert.deepEqual(readdirSync(join(out, "qa-process")), ["risk-map"]);
});

// A small stand-in for testomatio/skills: a marketplace, real skills under
// skills/, and plugin entries that link to them.
function skillsRepo() {
  const repo = mkdtempSync(join(tmpdir(), "skills-repo-"));
  const plugins = [
    { name: "test-management", source: "./plugins/test-management", skills: ["qa-thinking", "sync-cases"] },
    { name: "qa-process", source: "./plugins/qa-process", skills: ["qa-thinking", "risk-map"] },
  ];
  mkdirSync(join(repo, ".claude-plugin"));
  writeFileSync(join(repo, ".claude-plugin", "marketplace.json"), JSON.stringify({ plugins }));
  for (const name of ["qa-thinking", "sync-cases", "risk-map", "not-in-a-plugin"]) {
    mkdirSync(join(repo, "skills", name, "refs"), { recursive: true });
    writeFileSync(join(repo, "skills", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
    writeFileSync(join(repo, "skills", name, "refs", "notes.md"), "notes\n");
  }
  for (const plugin of plugins) {
    mkdirSync(join(repo, plugin.source, "skills"), { recursive: true });
    for (const name of plugin.skills) symlinkSync(join("..", "..", "..", "skills", name), join(repo, plugin.source, "skills", name));
  }
  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "skills");
  return `file://${repo}`;
}
