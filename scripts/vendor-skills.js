/**
 * Copies the skills of testomatio/skills into skills/<plugin>/<skill>/.
 *
 * Every release runs it, and the vendored folders are gitignored, so a release
 * that skips it ships no skills. Plain Node: the release workflow has no build step.
 *
 *   node scripts/vendor-skills.js
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLS_REPO = "https://github.com/testomatio/skills.git";
export const SKILLS_OUTPUT = join(import.meta.dirname, "..", "skills");

/**
 * Clones the repo and copies each plugin's skills into a folder named after the
 * plugin. The folder is the category hosts show. A skill two plugins list lands
 * in the first one only.
 */
export class SkillsVendor {
  constructor({ outputDir = SKILLS_OUTPUT, repo = SKILLS_REPO } = {}) {
    this.outputDir = outputDir;
    this.repo = repo;
  }

  async update() {
    const clone = mkdtempSync(join(tmpdir(), "testeiya-skills-"));
    try {
      execFileSync("git", ["clone", "-q", "--depth", "1", this.repo, clone], { stdio: "pipe" });
      rmSync(this.outputDir, { recursive: true, force: true });
      const copied = this.#copyPlugins(clone);
      console.log(`Vendored ${copied} skills from ${this.repo} into ${this.outputDir}`);
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }
  }

  // A plugin's skills/ entries link to the repo's skills/<name>. Only the names
  // are read: a Windows clone without symlinks turns the links into text files.
  #copyPlugins(clone) {
    const marketplace = JSON.parse(readFileSync(join(clone, ".claude-plugin", "marketplace.json"), "utf-8"));
    const seen = new Set();
    for (const plugin of marketplace.plugins ?? []) {
      const entries = join(clone, plugin.source, "skills");
      if (!existsSync(entries)) continue;
      for (const name of readdirSync(entries)) {
        const from = join(clone, "skills", name);
        if (seen.has(name) || !existsSync(join(from, "SKILL.md"))) continue;
        seen.add(name);
        const to = join(this.outputDir, plugin.name, name);
        mkdirSync(to, { recursive: true });
        cpSync(from, to, { recursive: true, dereference: true });
      }
    }
    return seen.size;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await new SkillsVendor().update();
