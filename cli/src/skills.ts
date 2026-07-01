import { join, dirname } from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { parse as parseYaml } from "yaml";
import type { Skill } from "@oh-my-pi/pi-coding-agent";

const require = createRequire(import.meta.url);

export function loadTestomatioSkills(): Skill[] {
  const skillsPkgPath = dirname(require.resolve("@testomatio/skills/package.json"));
  const testomatioSkillsPath = join(skillsPkgPath, "skills");
  const skills: Skill[] = [];
  if (!existsSync(testomatioSkillsPath)) return skills;

  for (const entry of readdirSync(testomatioSkillsPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skill = readSkill(join(testomatioSkillsPath, entry.name), entry.name, "testomatio");
    if (skill) skills.push(skill);
  }
  return skills;
}

/** The Playwright Agent CLI skill bundled inside the `@playwright/cli` package. */
export function loadPlaywrightCliSkill(): Skill[] {
  let pkgPath: string;
  try {
    pkgPath = require.resolve("@playwright/cli/package.json");
  } catch {
    return [];
  }
  const skillDir = join(dirname(pkgPath), "skills", "playwright-cli");
  const skill = readSkill(skillDir, "playwright-cli", "playwright");
  return skill ? [skill] : [];
}

function readSkill(skillDir: string, fallbackName: string, source: string): Skill | null {
  const skillFile = join(skillDir, "SKILL.md");
  if (!existsSync(skillFile)) return null;
  const content = readFileSync(skillFile, "utf-8");
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = fmMatch ? parseYaml(fmMatch[1]) : null;
  const name = fm?.name?.toString().trim() || fallbackName;
  const description = fm?.description?.toString().trim() || "";
  return { name, description, filePath: skillFile, baseDir: skillDir, source };
}
