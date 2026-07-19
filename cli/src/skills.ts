import { join } from "node:path";
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parse as parseYaml } from "yaml";
import dedent from "dedent";
import type { Skill } from "@oh-my-pi/pi-coding-agent";
import { CUSTOM_SKILLS_DIR, projectSkillsDir, resolveBundledSkillsDir } from "./project-dir.js";

const require = createRequire(import.meta.url);

/**
 * Whether the Playwright browser CLI (`@playwright/cli`) is installed. This gates
 * the browser-automation guidance in the system prompt so it's only advertised
 * when the tool is actually present. The `playwright-cli` *skill* is vendored
 * from GitHub (`microsoft/playwright-cli`) like every other prebuilt skill — it
 * is not read from the package.
 */
export function hasPlaywrightCli(): boolean {
  try {
    require.resolve("@playwright/cli/package.json");
    return true;
  } catch {
    return false;
  }
}

/**
 * The skills tree shipped with the CLI package / desktop bundle, organized by
 * vendor folder: external vendors written by `bunosh skills:update` plus
 * first-party folders authored in this repo (e.g. `testeiya/`). Inside a vendor
 * folder — a root SKILL.md makes the folder one flat skill; a child folder with
 * a SKILL.md is a skill whose `category` is the (prettified) vendor folder; a
 * child folder without one is a category folder whose skill children get that
 * folder as `category`. Source `"bundled"`.
 */
export function loadBundledSkills(): CategorizedSkill[] {
  const dir = resolveBundledSkillsDir();
  if (!existsSync(dir)) return [];
  const skills: CategorizedSkill[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    skills.push(...readVendorDir(join(dir, entry.name), entry.name));
  }
  return skills;
}

/**
 * User-added skills from the global `~/.testeiya/skills` folder and, when a
 * workspace is open, its per-project `<cwd>/.testeiya/skills`. Directory entries
 * that are symlinks are followed so a skill can live in another repo and be
 * linked in. Deduped by name so a per-project or custom skill overrides one from
 * a broader scope.
 */
export function loadCustomSkills(cwd?: string): CategorizedSkill[] {
  const dirs = [CUSTOM_SKILLS_DIR];
  if (cwd) dirs.push(projectSkillsDir(cwd));
  const skills: CategorizedSkill[] = [];
  for (const dir of dirs) skills.push(...readSkillsDir(dir, "custom"));
  return dedupeSkillsByName(skills);
}

/** Create the global custom-skills folder and seed a README the first time. */
export function ensureCustomSkillsDir(): string {
  mkdirSync(CUSTOM_SKILLS_DIR, { recursive: true });
  const readme = join(CUSTOM_SKILLS_DIR, "README.md");
  if (!existsSync(readme)) writeFileSync(readme, CUSTOM_SKILLS_README);
  return CUSTOM_SKILLS_DIR;
}

/** Keep one skill per name; the last occurrence wins. */
export function dedupeSkillsByName<T extends Skill>(skills: T[]): T[] {
  const byName = new Map<string, T>();
  for (const skill of skills) byName.set(skill.name, skill);
  return [...byName.values()];
}

/** One vendor folder of the bundled tree — see `loadBundledSkills` for the layout. */
function readVendorDir(vendorDir: string, vendorName: string): CategorizedSkill[] {
  const vendorCategory = prettifyCategory(vendorName);
  const single = readSkill(vendorDir, vendorName, "bundled");
  if (single) {
    single.category = vendorCategory;
    return [single];
  }
  const skills: CategorizedSkill[] = [];
  for (const entry of readdirSync(vendorDir, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const entryDir = join(vendorDir, entry.name);
    const skill = readSkill(entryDir, entry.name, "bundled");
    if (skill) {
      skill.category = vendorCategory;
      skills.push(skill);
      continue;
    }
    for (const nested of readSkillsDir(entryDir, "bundled")) {
      nested.category = prettifyCategory(entry.name);
      skills.push(nested);
    }
  }
  return skills;
}

/**
 * Scan one flat skills folder: every child directory that holds a `SKILL.md` is
 * a skill (symlinks are followed, so a skill can be linked in). Entries without
 * a `SKILL.md` are ignored. Used per-category for the vendored bundle, and for
 * the (flat) user skills dirs.
 */
function readSkillsDir(dir: string, source: string): CategorizedSkill[] {
  if (!existsSync(dir)) return [];
  const skills: CategorizedSkill[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skill = readSkill(join(dir, entry.name), entry.name, source);
    if (skill) skills.push(skill);
  }
  return skills;
}

/** Turn a category folder slug (`test-management`) into a label (`Test Management`). */
function prettifyCategory(folder: string): string {
  return folder
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function readSkill(skillDir: string, fallbackName: string, source: string): CategorizedSkill | null {
  const skillFile = join(skillDir, "SKILL.md");
  if (!existsSync(skillFile)) return null;
  const content = readFileSync(skillFile, "utf-8");
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = fmMatch ? parseYaml(fmMatch[1]) : null;
  const fmName = fm?.name?.toString().trim();
  // A skill name is used as a mention token, so it must be a slug; fall back to
  // the folder name when the frontmatter name isn't one (e.g. a spaced title).
  const name = fmName && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fmName) ? fmName : fallbackName;
  const description = fm?.description?.toString().trim() || "";
  return { name, description, filePath: skillFile, baseDir: skillDir, source };
}

const CUSTOM_SKILLS_README = dedent`
  # Testeiya custom skills

  Drop a skill here to make it available to the agent. A skill is a folder that
  contains a \`SKILL.md\` file — YAML frontmatter with a \`name\` and
  \`description\`, followed by the skill's instructions:

      ~/.testeiya/skills/my-skill/SKILL.md

  You can also symlink a skill that already lives in another repository:

      ln -s /path/to/repo/skills/my-skill ~/.testeiya/skills/my-skill

  After adding or linking a skill, click **Refresh** in the Skills menu.

  Skills placed here are available in every workspace. To scope a skill to a
  single project, put it in that workspace's \`.testeiya/skills/\` folder instead.
` + "\n";

/** An SDK `Skill` plus the category folder it was discovered under, if any. */
export type CategorizedSkill = Skill & { category?: string };
