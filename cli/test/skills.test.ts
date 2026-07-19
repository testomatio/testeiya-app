import { test, expect, describe, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadBundledSkills } from "../src/skills.js";

const dirs: string[] = [];
const ENV_KEY = "TESTEIYA_SKILLS_DIR";
const savedEnv = process.env[ENV_KEY];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

describe("loadBundledSkills", () => {
  test("reads <vendor>/<category>/<skill> folders; category is the prettified category folder", () => {
    const root = tmp();
    writeSkill(root, "testomatio/test-management", "qa-thinking", "qa-thinking", "QA thinking");
    writeSkill(root, "testomatio/test-automation", "automate-manual-test-cases", "automate-manual-test-cases", "auto");
    process.env[ENV_KEY] = root;

    const byName = Object.fromEntries(loadBundledSkills().map((s) => [s.name, s]));
    expect(Object.keys(byName).sort()).toEqual(["automate-manual-test-cases", "qa-thinking"]);
    expect(byName["qa-thinking"].category).toBe("Test Management");
    expect(byName["qa-thinking"].source).toBe("bundled");
    expect(byName["automate-manual-test-cases"].category).toBe("Test Automation");
  });

  test("skills right under a vendor folder get the vendor as category (internal testeiya folder)", () => {
    const root = tmp();
    writeSkill(root, "codeceptjs", "writing-codeceptjs-tests", "writing-codeceptjs-tests", "write");
    writeSkill(root, "testeiya", "testeiya-example", "testeiya-example", "example");
    process.env[ENV_KEY] = root;

    const byName = Object.fromEntries(loadBundledSkills().map((s) => [s.name, s]));
    expect(byName["writing-codeceptjs-tests"].category).toBe("Codeceptjs");
    expect(byName["testeiya-example"].category).toBe("Testeiya");
    expect(byName["testeiya-example"].source).toBe("bundled");
  });

  test("a top-level folder that is itself a skill (single-skill vendor, flat)", () => {
    const root = tmp();
    const dir = path.join(root, "playwright-best-practices-skill");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: playwright-best-practices\ndescription: PW\n---\n\nbody\n");
    process.env[ENV_KEY] = root;

    const skills = loadBundledSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("playwright-best-practices");
    expect(skills[0].category).toBe("Playwright Best Practices Skill");
  });

  test("mixed vendor folder: direct skills and category folders side by side", () => {
    const root = tmp();
    writeSkill(root, "acme", "direct-skill", "direct-skill", "direct");
    writeSkill(root, "acme/deep-cat", "nested-skill", "nested-skill", "nested");
    process.env[ENV_KEY] = root;

    const byName = Object.fromEntries(loadBundledSkills().map((s) => [s.name, s]));
    expect(byName["direct-skill"].category).toBe("Acme");
    expect(byName["nested-skill"].category).toBe("Deep Cat");
  });

  test("prefers the SKILL.md frontmatter name over the folder name", () => {
    const root = tmp();
    writeSkill(root, "cat", "some-folder", "real-name", "desc");
    process.env[ENV_KEY] = root;

    const skills = loadBundledSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("real-name");
  });

  test("falls back to the folder name when the frontmatter name is not a slug", () => {
    const root = tmp();
    writeSkill(root, "cat", "testomat-allure-adapter", "Testomat Allure Adapter Setup", "desc");
    process.env[ENV_KEY] = root;

    const skills = loadBundledSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("testomat-allure-adapter");
  });

  test("a vendor folder with no skills yields nothing, not a crash", () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, "empty-vendor"), { recursive: true });
    fs.mkdirSync(path.join(root, "acme", "empty-cat"), { recursive: true });
    writeSkill(root, "acme", "real", "real", "desc");
    process.env[ENV_KEY] = root;

    const skills = loadBundledSkills();
    expect(skills.map((s) => s.name)).toEqual(["real"]);
    expect(skills[0].category).toBe("Acme");
  });

  test("an empty skills dir yields no skills", () => {
    const root = tmp();
    process.env[ENV_KEY] = root;
    expect(loadBundledSkills()).toEqual([]);
  });
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
  dirs.push(d);
  return d;
}

function writeSkill(root: string, parent: string, folder: string, name: string, description: string): void {
  const dir = path.join(root, parent, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\nbody\n`);
}
