import { join, basename } from "node:path";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
  realpathSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";

const { shell, say, yell } = global.bunosh;

const CLI_ROOT = import.meta.dir;
const SKILLS_MANIFEST = join(CLI_ROOT, "skills.yaml");
const SKILLS_OUTPUT = join(CLI_ROOT, "skills");
const SKILLS_LOCK = join(CLI_ROOT, "skills.lock.json");

/**
 * Vendor the prebuilt skills declared in cli/skills.yaml into a committed tree
 * cli/skills/<category>/<skill>/ — organized by category folder. The category is
 * decided by the repo: each plugin in its Claude-plugin marketplace is a category
 * (so testomatio/skills → test-management / test-automation / explorbot), or the
 * repo name when there's no marketplace; it is slugified into the folder name. A
 * skill in the repo but not in any plugin is skipped. Every source is a GitHub
 * repo (owner/repo) fetched via the GitHub tarball (no git binary); resolved SHAs
 * are pinned in cli/skills.lock.json. Re-run on release.
 */
export async function vendorSkills() {
  if (!existsSync(SKILLS_MANIFEST)) {
    yell(`No manifest at ${SKILLS_MANIFEST}`);
    return;
  }
  const parsed = parseYaml(readFileSync(SKILLS_MANIFEST, "utf-8")) ?? [];
  const sources = Array.isArray(parsed) ? parsed : Object.values(parsed).flat();
  say(`Vendoring skills from ${SKILLS_MANIFEST}`);
  rmSync(SKILLS_OUTPUT, { recursive: true, force: true });

  const lock = [];
  const seen = new Set();
  for (const raw of sources) {
    const entry = normalizeEntry(raw);
    const from = isLocal(entry.source) ? resolveLocalSource(entry) : await fetchGitSource(entry);
    if (!from) continue;
    const found = findSkills(from.root, entry.include, repoCategory(entry.source));
    if (found.length === 0) {
      say(`  ! ${entry.source} — no SKILL.md found`);
      continue;
    }
    const vendored = [];
    for (const skill of found) {
      if (seen.has(skill.slug)) {
        yell(`  ! duplicate skill "${skill.slug}" (${entry.source}) — keeping the first, skipping this one`);
        continue;
      }
      const categoryDir = slugify(skill.category);
      // A single-skill repo is its own category — vendor it flat as
      // cli/skills/<category>/ (no redundant <category>/<skill>/ nesting).
      const rel = skill.single ? categoryDir : join(categoryDir, skill.slug);
      copySkill(skill.dir, join(SKILLS_OUTPUT, rel));
      seen.add(skill.slug);
      vendored.push(skill.slug);
      say(`  ✓ ${rel}`);
    }
    lock.push({ source: entry.source, ref: entry.ref ?? null, sha: from.sha, skills: vendored });
    if (from.cleanup) rmSync(from.cleanup, { recursive: true, force: true });
  }

  writeFileSync(SKILLS_LOCK, JSON.stringify({ sources: lock }, null, 2) + "\n");
  say(`\nWrote ${seen.size} skill(s) to ${SKILLS_OUTPUT} by category; pinned ${lock.length} source(s) in ${SKILLS_LOCK}.`);
}

/** List the vendored skills grouped by category (reads cli/skills + categories.json). */
export async function skills() {
  if (!existsSync(SKILLS_OUTPUT)) {
    yell(`No vendored skills at ${SKILLS_OUTPUT} — run "bunosh vendor:skills" first.`);
    return;
  }
  const groups = {};
  let total = 0;
  for (const cat of readdirSync(SKILLS_OUTPUT, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    const category = prettifyCategory(cat.name);
    const catDir = join(SKILLS_OUTPUT, cat.name);
    if (existsSync(join(catDir, "SKILL.md"))) {
      (groups[category] ??= []).push(cat.name);
      total++;
      continue;
    }
    for (const skill of readdirSync(catDir, { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      if (!existsSync(join(catDir, skill.name, "SKILL.md"))) continue;
      (groups[category] ??= []).push(skill.name);
      total++;
    }
  }
  const names = Object.keys(groups).sort();
  say(`${total} skills in ${names.length} categories:\n`);
  for (const category of names) {
    say(`  ${category} (${groups[category].length})`);
    for (const slug of groups[category].sort()) say(`    · ${slug}`);
  }
}

/** Seed ~/.testeiya/.env with a commented Langfuse block (observability off by default). */
export async function setupEnv() {
  await shell`bun scripts/setup-env.ts`.cwd(CLI_ROOT);
}

/**
 * Fetch a Langfuse trace / session / recent range and dump it under cli/log/.
 * @param {string} target - trace id, session:<id>, or a range (30m|1h|today)
 */
export async function debugTrace(target = null) {
  await shell`bun scripts/langfuse-trace.ts ${target ?? ""}`.cwd(CLI_ROOT);
}

/**
 * Pull a full debug snapshot from the running app-server into cli/log/.
 * @param {string} session - optional agent conversation id to include its meta
 */
export async function debugSnapshot(session = null) {
  await shell`bun scripts/debug-snapshot.ts ${session ?? ""}`.cwd(CLI_ROOT);
}

/** Run the CLI/agent test suite (bun test). */
export async function test() {
  await shell`bun test`.cwd(CLI_ROOT);
}

function normalizeEntry(raw) {
  if (typeof raw === "string") return { source: raw };
  if (raw.source) return raw;
  const [source, value] = Object.entries(raw)[0];
  return { source, include: Array.isArray(value) ? value : undefined };
}

function isLocal(source) {
  return source.startsWith(".") || source.startsWith("/") || source.startsWith("~");
}

async function fetchGitSource(entry) {
  const { owner, repo, ref, subpath } = parseGitSource(entry.source, entry.ref);
  const sha = await resolveSha(owner, repo, ref);
  if (!sha) return null;
  const extractDir = join(tmpdir(), `testeiya-vendor-${owner}-${repo}-${sha.slice(0, 8)}`);
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  const tgz = join(extractDir, "source.tar.gz");
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/${sha}`;
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    yell(`Download failed (${res.status}) for ${url}`);
    return null;
  }
  await Bun.write(tgz, res);
  const untar = await shell`tar -xzf ${tgz} -C ${extractDir}`;
  if (untar.hasFailed) {
    yell(`tar failed for ${entry.source}`);
    return null;
  }

  const inner = readdirSync(extractDir, { withFileTypes: true }).find((e) => e.isDirectory());
  if (!inner) {
    yell(`Empty archive for ${entry.source}`);
    return null;
  }
  let root = join(extractDir, inner.name);
  const sub = entry.subpath ?? subpath;
  if (sub) root = join(root, sub);
  return { root, sha, cleanup: extractDir };
}

function resolveLocalSource(entry) {
  let root = entry.source.replace(/^~(?=$|\/)/, homedir());
  if (entry.subpath) root = join(root, entry.subpath);
  if (!existsSync(root)) {
    yell(`Local source not found: ${root}`);
    return null;
  }
  return { root, sha: "local" };
}

function findSkills(root, include, fallbackCategory) {
  const all = collectSkills(root, fallbackCategory);
  const wanted = (include ?? []).filter((n) => n !== "*");
  if (wanted.length === 0) return all;
  return all.filter((s) => wanted.includes(s.name) || wanted.includes(s.slug));
}

function collectSkills(root, fallbackCategory) {
  // A repo whose SKILL.md sits at the root is a single skill; its folder is the
  // tarball's `<repo>-<sha>` dir, so slug from the skill name, not the folder.
  if (existsSync(join(root, "SKILL.md"))) {
    const name = skillName(root);
    return [{ name, slug: slugify(name), dir: root, category: fallbackCategory, single: true }];
  }

  // A repo's Claude-plugin marketplace defines the categories: each plugin is a
  // category and the skills it lists (symlinks in plugins/<p>/skills) get it. A
  // single-plugin repo keeps the manifest's label; a multi-plugin repo (e.g.
  // testomatio/skills → test-management / test-automation / explorbot) splits.
  const marketplace = join(root, ".claude-plugin", "marketplace.json");
  if (existsSync(marketplace)) {
    const skills = collectFromMarketplace(root, marketplace);
    if (skills.length > 0) return skills;
  }

  const skillsDir = join(root, "skills");
  if (existsSync(skillsDir)) {
    const skills = collectFromDir(skillsDir);
    if (skills.length > 0) return withCategory(skills, fallbackCategory);
  }

  return withCategory(collectFromDir(root), fallbackCategory);
}

function collectFromMarketplace(root, marketplace) {
  const plugins = (JSON.parse(readFileSync(marketplace, "utf-8")).plugins ?? []).filter((p) => p.source);
  const bySlug = new Map();
  for (const plugin of plugins) {
    const category = prettifyCategory(plugin.name);
    const pluginDir = join(root, plugin.source);
    if (existsSync(join(pluginDir, "SKILL.md"))) {
      addSkill(bySlug, { name: skillName(pluginDir), slug: basename(pluginDir), dir: pluginDir, category });
      continue;
    }
    const pluginSkills = join(pluginDir, "skills");
    if (!existsSync(pluginSkills)) continue;
    for (const entry of readdirSync(pluginSkills, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const dir = resolveSkillDir(join(pluginSkills, entry.name), entry.name, root);
      if (dir) addSkill(bySlug, { name: skillName(dir), slug: entry.name, dir, category });
    }
  }
  // A skill in the repo but not in any plugin isn't categorized by the repo's
  // plugin config, so it's not shipped — report it so the omission is visible.
  for (const skill of collectFromDir(join(root, "skills"))) {
    if (!bySlug.has(skill.slug)) say(`  · ${skill.slug} — in repo but not in any plugin, skipped`);
  }
  return [...bySlug.values()];
}

function repoCategory(source) {
  if (isLocal(source)) return prettifyCategory(basename(source));
  return prettifyCategory(parseGitSource(source).repo ?? source);
}

// A plugin's skills/ entry is usually a symlink to the repo's real skill folder
// at skills/<name>; prefer that conventional path, fall back to resolving the
// symlink, then to the entry itself.
function resolveSkillDir(entryPath, entryName, repoRoot) {
  const conventional = join(repoRoot, "skills", entryName);
  if (existsSync(join(conventional, "SKILL.md"))) return conventional;
  const real = safeRealpath(entryPath);
  if (real && existsSync(join(real, "SKILL.md"))) return real;
  if (existsSync(join(entryPath, "SKILL.md"))) return entryPath;
  return null;
}

function collectFromDir(dir) {
  if (!existsSync(dir)) return [];
  const skills = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    // A plugin's skills/ holds symlinks into the repo's real skill folders.
    let skillDir = join(dir, entry.name);
    if (entry.isSymbolicLink()) skillDir = safeRealpath(skillDir);
    if (!skillDir || !existsSync(join(skillDir, "SKILL.md"))) continue;
    // A skill inside a collection keeps its own folder name as the slug.
    skills.push({ name: skillName(skillDir), slug: entry.name, dir: skillDir });
  }
  return skills;
}

function addSkill(bySlug, skill) {
  if (!bySlug.has(skill.slug)) bySlug.set(skill.slug, skill);
}

function withCategory(skills, category) {
  for (const skill of skills) skill.category = category;
  return skills;
}

function prettifyCategory(name) {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function safeRealpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function skillName(skillDir) {
  const file = join(skillDir, "SKILL.md");
  if (existsSync(file)) {
    const fm = readFileSync(file, "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const parsed = fm ? parseYaml(fm[1]) : null;
    const name = parsed?.name?.toString().trim();
    if (name) return name;
  }
  return basename(skillDir);
}

function copySkill(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    cpSync(join(srcDir, entry.name), join(destDir, entry.name), { recursive: true, dereference: true });
  }
}

async function resolveSha(owner, repo, ref) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${ref}`;
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    yell(`GitHub API ${res.status} resolving ${owner}/${repo}@${ref}`);
    return null;
  }
  const data = await res.json();
  return data.sha ?? null;
}

function parseGitSource(source, ref) {
  const path = source.replace(/^git\+/, "").replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  const treeMatch = path.match(/^([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?$/);
  if (treeMatch) return { owner: treeMatch[1], repo: treeMatch[2], ref: ref ?? treeMatch[3], subpath: treeMatch[4] };
  const [owner, repo] = path.split("/");
  return { owner, repo, ref: ref ?? "HEAD" };
}

function githubHeaders() {
  const headers = { "User-Agent": "testeiya-vendor-skills", Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
