// Validates every first-party SKILL.md against the Agent Skills rules:
// a `name` that is a lowercase slug matching its folder, and a `description`
// under 1024 characters. Run by CI on every pull request.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "skills", "testeiya");
const MAX_DESCRIPTION = 1024;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const problems = [];
const files = findSkillFiles(ROOT);

for (const file of files) {
  const frontmatter = readFrontmatter(file);
  if (!frontmatter) {
    problems.push(`${file}: no --- frontmatter block`);
    continue;
  }
  const name = frontmatter.name;
  const folder = basename(dirname(file));
  if (!name) problems.push(`${file}: missing "name"`);
  else if (!SLUG.test(name)) problems.push(`${file}: name "${name}" is not a lowercase slug`);
  else if (name !== folder) problems.push(`${file}: name "${name}" does not match folder "${folder}"`);

  const description = frontmatter.description;
  if (!description) problems.push(`${file}: missing "description"`);
  else if (description.length > MAX_DESCRIPTION) {
    problems.push(`${file}: description is ${description.length} characters (max ${MAX_DESCRIPTION})`);
  }
}

if (files.length === 0) {
  console.error(`No SKILL.md found under ${ROOT}`);
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`${problems.length} problem(s) in ${files.length} skill(s):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`${files.length} skill(s) valid.`);

function findSkillFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findSkillFiles(path));
      continue;
    }
    if (entry.name === "SKILL.md" && statSync(path).isFile()) found.push(path);
  }
  return found;
}

// Frontmatter is a leading `---` fence, `key: value` lines, then a closing `---`.
function readFrontmatter(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") return out;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[key] = value;
  }
  return null;
}
