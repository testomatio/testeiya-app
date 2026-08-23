import { dirname, relative } from "node:path";
import { SettingsManager, type ResourceDiagnostic, type Skill } from "@earendil-works/pi-coding-agent";
import { BUNDLED_SKILLS_DIR, createLoader } from "./session.js";

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
  process.stdout.write('\n  Name one in the task:  testeiya task "review this pr /qa-thinking"\n\n');
  return 0;
}

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

export interface BundledSkills {
  count: number;
  groups: Group[];
  diagnostics: ResourceDiagnostic[];
}
