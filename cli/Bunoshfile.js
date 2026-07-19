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
const INTERNAL_SKILLS_DIR = join(SKILLS_OUTPUT, "testeiya");

/**
 * Update the vendored external skills declared in cli/skills.yaml into the
 * committed tree cli/skills/<vendor>/ — one folder per vendor (the repo name,
 * or the owner when the repo is just "skills"). Marketplace categories nest as
 * cli/skills/<vendor>/<category>/<skill>/ (so testomatio/skills →
 * testomatio/test-management + test-automation + explorbot); a repo without a
 * marketplace puts its skills right under the vendor folder; a single-skill
 * repo is vendored flat as cli/skills/<vendor>/SKILL.md. Only manifest-owned
 * folders are replaced — any other folder in cli/skills (e.g. testeiya/, this
 * repo's first-party skills) is internal and never touched. Every source is a
 * GitHub repo (owner/repo) fetched via the GitHub tarball (no git binary);
 * resolved SHAs + owned folders are pinned in cli/skills.lock.json. Re-run on
 * release.
 * @param {string} vendor - only update this vendor (folder, owner, or owner/repo)
 */
export async function skillsUpdate(vendor = "") {
  if (!existsSync(SKILLS_MANIFEST)) {
    yell(`No manifest at ${SKILLS_MANIFEST}`);
    return;
  }
  const parsed = parseYaml(readFileSync(SKILLS_MANIFEST, "utf-8")) ?? [];
  const allSources = (Array.isArray(parsed) ? parsed : Object.values(parsed).flat()).map(normalizeEntry);
  let entries = allSources;
  if (vendor) entries = allSources.filter((e) => matchesVendor(e, vendor));
  if (entries.length === 0) {
    yell(`No manifest source matches "${vendor}"`);
    say(`Known vendors: ${allSources.map((e) => vendorFolder(e.source)).join(", ")}`);
    return;
  }
  say(`Updating ${entries.length} of ${allSources.length} source(s) from ${SKILLS_MANIFEST}`);

  const prevLock = readLock();
  const managed = new Set(prevLock.map((l) => l.folder).filter(Boolean));
  if (!vendor) removeStaleFolders(prevLock, allSources);

  // Slugs already taken by sources not updated in this run, so a filtered run
  // still detects cross-vendor duplicates.
  const seen = new Set();
  for (const locked of prevLock) {
    if (entries.some((e) => e.source === locked.source)) continue;
    for (const slug of locked.skills ?? []) seen.add(slug);
  }
  const internal = skillSlugsOnDisk(managed);

  const updatedLock = [];
  for (const entry of entries) {
    const folder = vendorFolder(entry.source);
    const target = join(SKILLS_OUTPUT, folder);
    if (existsSync(target) && !managed.has(folder)) {
      yell(`  ! ${entry.source} → skills/${folder} exists but is not managed by the lock — treating the folder as internal, skipping this source`);
      continue;
    }
    const from = isLocal(entry.source) ? resolveLocalSource(entry) : await fetchGitSource(entry);
    if (!from) continue;
    const found = findSkills(from.root, entry.include, repoCategory(entry.source));
    if (found.length === 0) {
      say(`  ! ${entry.source} — no SKILL.md found`);
      continue;
    }
    rmSync(target, { recursive: true, force: true });
    const vendored = [];
    for (const skill of found) {
      if (seen.has(skill.slug)) {
        yell(`  ! duplicate skill "${skill.slug}" (${entry.source}) — keeping the first, skipping this one`);
        continue;
      }
      if (internal.has(skill.slug)) say(`  ! "${skill.slug}" (${entry.source}) collides with a skill in an internal folder`);
      const rel = skillRelPath(folder, skill);
      copySkill(skill.dir, join(SKILLS_OUTPUT, rel));
      seen.add(skill.slug);
      vendored.push(skill.slug);
      say(`  ✓ ${rel}`);
    }
    updatedLock.push({ source: entry.source, ref: entry.ref ?? null, sha: from.sha, folder, skills: vendored });
    managed.add(folder);
    if (from.cleanup) rmSync(from.cleanup, { recursive: true, force: true });
  }

  const sources = mergeLock(allSources, prevLock, updatedLock, !vendor);
  writeFileSync(SKILLS_LOCK, JSON.stringify({ sources }, null, 2) + "\n");
  say(`\nUpdated ${updatedLock.length} vendor(s) in ${SKILLS_OUTPUT}; pinned in ${SKILLS_LOCK}.`);
}

/**
 * Scaffold a new first-party skill at cli/skills/testeiya/<name>/SKILL.md and
 * print how to try it. The name is slugified — it becomes the /mention token.
 * @param {string} name - the new skill's name (slug)
 */
export async function skillsCreate(name) {
  const slug = slugify(name ?? "");
  if (!slug) {
    yell("Usage: bunosh skills:create <skill-name>");
    return;
  }
  const dir = join(INTERNAL_SKILLS_DIR, slug);
  if (existsSync(join(dir, "SKILL.md"))) {
    yell(`Skill already exists: ${dir}`);
    return;
  }
  if (skillSlugsOnDisk(new Set()).has(slug)) {
    say(`  ! "${slug}" already exists elsewhere in ${SKILLS_OUTPUT} — which one wins at load time is not deterministic, pick another name`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), skillTemplate(slug));
  say(`Created ${join(dir, "SKILL.md")}`);
  say(`
Next steps:
  1. Fill in the description + instructions in SKILL.md
  2. Start a new chat session (skills load at session start), or hit Refresh in the Skills menu
  3. Invoke it by typing /${slug} in the prompt`);
}

/** List the skills tree (cli/skills) grouped by vendor; folders not managed by the lock are marked internal. */
export async function skillsList() {
  if (!existsSync(SKILLS_OUTPUT)) {
    yell(`No skills at ${SKILLS_OUTPUT} — run "bunosh skills:update" first.`);
    return;
  }
  const managed = new Set(readLock().map((l) => l.folder).filter(Boolean));
  let total = 0;
  let vendors = 0;
  const entries = readdirSync(SKILLS_OUTPUT, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const paths = vendorSkillPaths(join(SKILLS_OUTPUT, entry.name));
    if (paths.length === 0) continue;
    vendors++;
    total += paths.length;
    let label = entry.name;
    if (!managed.has(entry.name)) label += " (internal)";
    say(`  ${label} (${paths.length})`);
    for (const p of paths.sort()) {
      if (p === ".") continue;
      say(`    · ${p}`);
    }
  }
  say(`\n${total} skill(s) from ${vendors} vendor(s) in ${SKILLS_OUTPUT}`);
}

/**
 * Re-collect the vendored models catalog (cli/models.catalog.json) from each
 * provider's live model listing via the SDK's descriptor fetchers. Prunes
 * models a provider no longer serves (unless released within the last year)
 * and adds models newer than the SDK's bundled models.json. Provider API keys
 * from the environment/.env widen the coverage. Re-run on release.
 */
export async function collectModels() {
  await shell`bun scripts/collect-models.ts`.cwd(CLI_ROOT);
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

/**
 * Print the browser's last-reported UI layout map (big components as a tree with
 * coordinates + sizes) from the running app-server.
 * @param {string} session - optional session id to target that browser
 */
export async function debugLayout(session = null) {
  await shell`bun scripts/debug-layout.ts ${session ?? ""}`.cwd(CLI_ROOT);
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

// The vendor folder is the repo name; an org's generic "skills" repo uses the
// owner instead (testomatio/skills → testomatio, codeceptjs/skills → codeceptjs).
function vendorFolder(source) {
  if (isLocal(source)) return slugify(basename(source));
  const { owner, repo } = parseGitSource(source);
  if (repo === "skills") return slugify(owner);
  return slugify(repo);
}

function matchesVendor(entry, vendor) {
  if (vendorFolder(entry.source) === vendor) return true;
  if (entry.source === vendor) return true;
  if (isLocal(entry.source)) return false;
  const { owner, repo } = parseGitSource(entry.source);
  return owner === vendor || `${owner}/${repo}` === vendor;
}

// Where a skill lands inside its vendor folder: single-skill repos are flat
// (<vendor>/SKILL.md); a category matching the vendor collapses so a repo
// without a marketplace doesn't nest as <vendor>/<vendor>/<skill>.
function skillRelPath(folder, skill) {
  if (skill.single) return folder;
  const categoryDir = slugify(skill.category);
  if (categoryDir === folder) return join(folder, skill.slug);
  return join(folder, categoryDir, skill.slug);
}

function readLock() {
  if (!existsSync(SKILLS_LOCK)) return [];
  try {
    return JSON.parse(readFileSync(SKILLS_LOCK, "utf-8")).sources ?? [];
  } catch {
    return [];
  }
}

// A full run drops lock entries for sources gone from the manifest (their
// folders were removed); a filtered run keeps them so a later full run still
// knows which folders it owns.
function mergeLock(allSources, prevLock, updatedLock, fullRun) {
  const updatedBySource = new Map(updatedLock.map((l) => [l.source, l]));
  const prevBySource = new Map(prevLock.map((l) => [l.source, l]));
  const sources = [];
  for (const entry of allSources) {
    const locked = updatedBySource.get(entry.source) ?? prevBySource.get(entry.source);
    if (locked) sources.push(locked);
  }
  if (fullRun) return sources;
  for (const locked of prevLock) {
    if (allSources.some((e) => e.source === locked.source)) continue;
    sources.push(locked);
  }
  return sources;
}

function removeStaleFolders(prevLock, sources) {
  const current = new Set(sources.map((e) => vendorFolder(e.source)));
  for (const locked of prevLock) {
    if (!locked.folder || current.has(locked.folder)) continue;
    rmSync(join(SKILLS_OUTPUT, locked.folder), { recursive: true, force: true });
    say(`  - removed skills/${locked.folder} (${locked.source} no longer in the manifest)`);
  }
}

// Skill slugs present in the tree, minus the excluded vendor folders — with the
// managed folders excluded this is the internal (first-party) skills.
function skillSlugsOnDisk(excludeFolders) {
  const slugs = new Set();
  if (!existsSync(SKILLS_OUTPUT)) return slugs;
  for (const entry of readdirSync(SKILLS_OUTPUT, { withFileTypes: true })) {
    if (!entry.isDirectory() || excludeFolders.has(entry.name)) continue;
    for (const p of vendorSkillPaths(join(SKILLS_OUTPUT, entry.name))) {
      if (p === ".") slugs.add(entry.name);
      else slugs.add(basename(p));
    }
  }
  return slugs;
}

function skillTemplate(slug) {
  return `---
name: ${slug}
description: TODO — one sentence saying when the agent should use this skill.
---

# ${prettifyCategory(slug)}

TODO: write the instructions the agent follows when this skill is invoked.
`;
}

// Relative skill paths inside one vendor folder: "." for a flat single-skill
// folder, "<skill>" for skills right under the vendor, "<category>/<skill>"
// for nested ones.
function vendorSkillPaths(vendorDir) {
  if (existsSync(join(vendorDir, "SKILL.md"))) return ["."];
  const paths = [];
  for (const child of readdirSync(vendorDir, { withFileTypes: true })) {
    if (!child.isDirectory()) continue;
    const childDir = join(vendorDir, child.name);
    if (existsSync(join(childDir, "SKILL.md"))) {
      paths.push(child.name);
      continue;
    }
    for (const nested of readdirSync(childDir, { withFileTypes: true })) {
      if (!nested.isDirectory()) continue;
      if (!existsSync(join(childDir, nested.name, "SKILL.md"))) continue;
      paths.push(join(child.name, nested.name));
    }
  }
  return paths;
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

// The fallback category (no marketplace) mirrors the vendor folder, so
// skillRelPath collapses it and the skills sit right under the vendor.
function repoCategory(source) {
  return prettifyCategory(vendorFolder(source));
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
