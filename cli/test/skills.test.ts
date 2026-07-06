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
  test("reads <category>/<skill> folders; category is the prettified folder name", () => {
    const root = tmp();
    writeSkill(root, "test-management", "qa-thinking", "qa-thinking", "QA thinking");
    writeSkill(root, "playwright-best-practices-skill", "playwright-best-practices", "playwright-best-practices", "PW");
    process.env[ENV_KEY] = root;

    const byName = Object.fromEntries(loadBundledSkills().map((s) => [s.name, s]));
    expect(Object.keys(byName).sort()).toEqual(["playwright-best-practices", "qa-thinking"]);
    expect(byName["qa-thinking"].category).toBe("Test Management");
    expect(byName["qa-thinking"].source).toBe("bundled");
    expect(byName["playwright-best-practices"].category).toBe("Playwright Best Practices Skill");
  });

  test("a top-level folder that is itself a skill (single-skill repo, vendored flat)", () => {
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

  test("a category folder with no skill subfolders yields nothing, not a crash", () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, "empty-cat"), { recursive: true });
    writeSkill(root, "cat", "real", "real", "desc");
    process.env[ENV_KEY] = root;

    const skills = loadBundledSkills();
    expect(skills.map((s) => s.name)).toEqual(["real"]);
    expect(skills[0].category).toBe("Cat");
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

function writeSkill(root: string, category: string, folder: string, name: string, description: string): void {
  const dir = path.join(root, category, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\nbody\n`);
}
