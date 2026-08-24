import { readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import {
  SettingsManager,
  stripFrontmatter,
  type ResourceDiagnostic,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { BUNDLED_SKILLS_DIR, createLoader } from "./session.js";

/**
 * A skill named in the task loads before the run: `/qa-thinking` puts that
 * SKILL.md in front of the prompt. pi does not do this for us — its own
 * `/skill:name` form expands only with prompt templates on, and a task carrying
 * a comment from a stranger never runs with those on. A name we do not ship
 * stays plain text, so `/testeiya` in a comment is still just words.
 */
export function expandSkills(prompt: string, skills: Skill[]): Expanded {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const loaded: Skill[] = [];
  for (const word of prompt.split(/\s+/)) {
    if (!word.startsWith("/")) continue;
    const skill = byName.get(skillName(word));
    if (!skill) continue;
    if (loaded.includes(skill)) continue;
    loaded.push(skill);
  }
  if (loaded.length === 0) return { prompt, loaded: [] };
  const blocks = loaded.map(block).join("\n\n");
  return { prompt: `${blocks}\n\n${prompt}`, loaded: loaded.map((skill) => skill.name) };
}

/**
 * The skills a run can actually reach. Loaded through the loader every command
 * shares, so this list, `doctor` and the model's own list cannot drift — and a
 * checkout's skills are filtered out here exactly as they are in a run.
 */
export async function loadBundledSkills(): Promise<BundledSkills> {
  const loader = createLoader({
    cwd: process.cwd(),
    settingsManager: SettingsManager.inMemory(),
    extensionPaths: [],
    systemPrompt: () => "",
  });
  await loader.reload();
  const { skills, diagnostics } = loader.getSkills();
  return { count: skills.length, groups: byGroup(skills), diagnostics };
}

export async function runSkills(pattern?: string, json?: boolean): Promise<number> {
  const { groups } = await loadBundledSkills();
  const matched = filter(groups, pattern);
  const count = matched.reduce((total, group) => total + group.skills.length, 0);

  if (json) {
    const rows = matched.flatMap((group) =>
      group.skills.map((skill) => ({
        name: skill.name,
        group: group.group,
        description: skill.description,
      }))
    );
    process.stdout.write(`${JSON.stringify({ skills: rows }, null, 2)}\n`);
    return 0;
  }

  if (count === 0 && pattern) {
    process.stdout.write(`  no bundled skill matches "${pattern}"\n`);
    return 1;
  }
  if (count === 0) {
    process.stdout.write("  no skills bundled — reinstall the package\n");
    return 1;
  }

  process.stdout.write(`\n  ${count} skills, bundled with testeiya\n`);
  for (const { group, skills } of matched) {
    process.stdout.write(`\n  ${group}\n`);
    for (const skill of skills) {
      process.stdout.write(`    ${skill.name.padEnd(32)} ${summary(skill.description)}\n`);
    }
  }
  process.stdout.write('\n  Load one in the task:  testeiya task "review this pr /qa-thinking"\n\n');
  return 0;
}

/** `/qa-thinking`, `/skill:qa-thinking`, `/qa-thinking.` — all the same skill. */
function skillName(word: string): string {
  let token = word.slice(1).toLowerCase();
  if (token.startsWith("skill:")) token = token.slice(6);
  while (token.length > 0 && !NAME_CHARS.includes(token.at(-1)!)) token = token.slice(0, -1);
  return token;
}

/** The block pi builds for `/skill:name`, so a loaded skill reads the same way. */
function block(skill: Skill): string {
  const body = stripFrontmatter(readFileSync(skill.filePath, "utf8")).trim();
  return (
    `<skill name="${skill.name}" location="${skill.filePath}">\n` +
    `References are relative to ${skill.baseDir}.\n\n${body}\n</skill>`
  );
}

const NAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-";

/** Match the name or what the skill says it is for, like `models <pattern>`. */
function filter(groups: Group[], pattern?: string): Group[] {
  if (!pattern) return groups;
  const needle = pattern.toLowerCase();
  const matched: Group[] = [];
  for (const group of groups) {
    const skills = group.skills.filter((skill) => {
      const haystack = `${group.group} ${skill.name} ${skill.description}`.toLowerCase();
      return haystack.includes(needle);
    });
    if (skills.length > 0) matched.push({ group: group.group, skills });
  }
  return matched;
}

/** The first sentence, cut to whatever the terminal has room for. */
function summary(description: string): string {
  const width = Math.max(30, (process.stdout.columns ?? 100) - 40);
  const first = description.split(". ")[0]!.trim();
  if (first.length <= width) return first;
  return `${first.slice(0, width - 1)}…`;
}

/** The vendor folder a skill came from — the category it is published under. */
function byGroup(skills: Skill[]): Group[] {
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    let group = dirname(relative(BUNDLED_SKILLS_DIR, skill.baseDir));
    if (group === "." || group.startsWith("..")) group = "bundled";
    const members = groups.get(group) ?? [];
    members.push(skill);
    groups.set(group, members);
  }
  return [...groups].map(([group, members]) => ({ group, skills: members }));
}

export interface Group {
  group: string;
  skills: Skill[];
}

export interface Expanded {
  prompt: string;
  loaded: string[];
}

export interface BundledSkills {
  count: number;
  groups: Group[];
  diagnostics: ResourceDiagnostic[];
}
