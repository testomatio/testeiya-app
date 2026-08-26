/**
 * Vendors the external skills declared in skills/skills.yaml into skills/<vendor>/.
 *
 * It lives here, inside the published package, because every release needs it and
 * only this directory travels with all of them: the npm release runs it right
 * before `npm publish`, and the desktop app's build fills the same tree. The
 * vendored folders are gitignored, so a release that skipped this would ship an
 * empty skills tree.
 *
 * Plain Node, no build step and no task runner — the release workflow has neither.
 *
 *   node scripts/vendor-skills.js                    every source
 *   node scripts/vendor-skills.js testomatio         one vendor
 *   node scripts/vendor-skills.js --repo owner/repo:branch
 */
import { basename, dirname, join, resolve } from "node:path";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
  copyFileSync,
  realpathSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const SKILLS_OUTPUT = join(import.meta.dirname, "..", "skills");
export const SKILLS_MANIFEST = join(SKILLS_OUTPUT, "skills.yaml");
export const SKILLS_LOCK = join(SKILLS_OUTPUT, "skills.lock.json");
const TGZ_NAME = "source.tar.gz";

/**
 * Vendor every source in the manifest (or one, when `vendor` names it) into
 * skills/<vendor>/ — one folder per vendor: the repo name, or the owner when the
 * repo is just "skills". A repo with a Claude-plugin marketplace nests its
 * plugins as skills/<vendor>/<category>/<skill>/; a repo without one puts its
 * skills right under the vendor folder; a single-skill repo is vendored flat as
 * skills/<vendor>/SKILL.md. A source may name its folder in the manifest
 * (`folder: playwright`), which is how repos from different owners share one
 * category — such a source always lays out as skills/<folder>/<skill>/.
 *
 * Only manifest-owned folders are replaced; any other folder in skills/ is left
 * alone. Sources are fetched from the GitHub tarball, no git binary involved,
 * and the resolved SHAs + owned folders are pinned in skills/skills.lock.json.
 * @param {string} vendor - only update this vendor (folder, owner, or owner/repo)
 * @param {object} options
 * @param {string} [options.repo=""] - update one source from a branch, as <owner/repo:branch>; fails when the repo or branch does not exist
 * @param {Set<string>} [options.internalSlugs] - slugs a host harness ships itself, reported when a vendored skill collides with one
 */
export async function vendorSkills(vendor = "", options = {}) {
  if (!existsSync(SKILLS_MANIFEST)) {
    console.warn(`No manifest at ${SKILLS_MANIFEST}`);
    return;
  }
  let branch = null;
  let filter = vendor;
  if (options.repo) {
    const match = String(options.repo).match(/^([^:]+):(.+)$/);
    if (!match) {
      throw new Error(`--repo expects <owner/repo:branch>, got "${options.repo}"`);
    }
    filter = match[1];
    branch = match[2];
  }
  const parsed = parseYaml(readFileSync(SKILLS_MANIFEST, "utf-8")) ?? [];
  const allSources = (Array.isArray(parsed) ? parsed : Object.values(parsed).flat()).map(normalizeEntry);
  let entries = allSources;
  if (filter) entries = allSources.filter((e) => matchesVendor(e, filter));
  if (entries.length === 0) {
    if (branch) {
      console.log(`Known sources: ${allSources.map((e) => e.source).join(", ")}`);
      throw new Error(`No manifest source matches "${filter}" — add it to ${SKILLS_MANIFEST} first`);
    }
    console.warn(`No manifest source matches "${filter}"`);
    console.log(`Known vendors: ${allSources.map(vendorFolder).join(", ")}`);
    return;
  }
  if (branch) {
    for (const entry of entries) entry.ref = branch;
    console.log(`Using branch "${branch}" for ${entries.map((e) => e.source).join(", ")}`);
  }
  console.log(`Updating ${entries.length} of ${allSources.length} source(s) from ${SKILLS_MANIFEST}`);

  const prevLock = readLock();
  const managed = new Set(prevLock.map((l) => l.folder).filter(Boolean));
  if (!filter) removeStaleFolders(prevLock, allSources);

  // Slugs already taken by sources not updated in this run, so a filtered run
  // still detects cross-vendor duplicates.
  const seen = new Set();
  for (const locked of prevLock) {
    if (entries.some((e) => e.source === locked.source)) continue;
    for (const slug of locked.skills ?? []) seen.add(slug);
  }
  const internal = options.internalSlugs ?? new Set();

  const updatedLock = [];
  const failed = [];
  for (const entry of entries) {
    const folder = vendorFolder(entry);
    const target = join(SKILLS_OUTPUT, folder);
    if (existsSync(target) && !managed.has(folder)) {
      console.warn(`  ! ${entry.source} → skills/${folder} exists but is not managed by the lock — treating the folder as internal, skipping this source`);
      continue;
    }
    const from = isLocal(entry.source) ? resolveLocalSource(entry) : await fetchGitSource(entry);
    if (!from) {
      if (branch) {
        throw new Error(`${entry.source}@${branch} not found — check the repo and branch exist`);
      }
      failed.push(entry.source);
      continue;
    }
    const found = findSkills(from.root, entry.include, repoCategory(entry));
    if (found.length === 0) {
      console.warn(`  ! ${entry.source} — no SKILL.md found`);
      failed.push(entry.source);
      continue;
    }
    clearVendored(entry, folder, prevLock, allSources);
    const vendored = [];
    for (const skill of found) {
      if (seen.has(skill.slug)) {
        console.warn(`  ! duplicate skill "${skill.slug}" (${entry.source}) — keeping the first, skipping this one`);
        continue;
      }
      if (internal.has(skill.slug)) console.log(`  ! "${skill.slug}" (${entry.source}) collides with a skill in an internal folder`);
      const rel = skillRelPath(entry, folder, skill);
      copySkill(skill.dir, join(SKILLS_OUTPUT, rel));
      seen.add(skill.slug);
      vendored.push(skill.slug);
      console.log(`  ✓ ${rel}`);
    }
    updatedLock.push({ source: entry.source, ref: entry.ref ?? null, sha: from.sha, folder, skills: vendored.slice().sort() });
    managed.add(folder);
    if (from.cleanup) rmSync(from.cleanup, { recursive: true, force: true });
  }

  const sources = mergeLock(allSources, prevLock, updatedLock, !filter);
  writeFileSync(SKILLS_LOCK, JSON.stringify({ sources }, null, 2) + "\n");
  console.log(`\nUpdated ${updatedLock.length} vendor(s) in ${SKILLS_OUTPUT}; pinned in ${SKILLS_LOCK}.`);
  // Loudly, because the callers are releases: a source that quietly failed to
  // fetch would publish a build with that vendor's skills missing.
  if (failed.length > 0) throw new Error(`could not vendor ${failed.join(", ")} — the tree is incomplete`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let repo = "";
  const flag = args.findIndex((arg) => arg.startsWith("--repo"));
  if (flag >= 0) {
    repo = args[flag].split("=")[1] ?? args.splice(flag + 1, 1)[0] ?? "";
    args.splice(flag, 1);
  }
  await vendorSkills(args.find((arg) => !arg.startsWith("-")) ?? "", { repo });
}

function normalizeEntry(raw) {
  if (typeof raw === "string") return { source: raw };
  if (raw.source) return raw;
  const [source, value] = Object.entries(raw)[0];
  return { source, include: Array.isArray(value) ? value : undefined };
}

// The vendor folder is the repo name; an org's generic "skills" repo uses the
// owner instead (testomatio/skills → testomatio, codeceptjs/skills → codeceptjs).
// The manifest may name it instead, so sources from different owners can share
// one category (playwright-cli + playwright-best-practices → playwright).
function vendorFolder(entry) {
  const { source, folder } = entry;
  if (folder) return slugify(folder);
  if (isLocal(source)) return slugify(basename(source));
  const { owner, repo } = parseGitSource(source);
  if (repo === "skills") return slugify(owner);
  return slugify(repo);
}

function matchesVendor(entry, vendor) {
  if (vendorFolder(entry) === vendor) return true;
  if (entry.source === vendor) return true;
  if (isLocal(entry.source)) return false;
  const { owner, repo } = parseGitSource(entry.source);
  return owner === vendor || `${owner}/${repo}` === vendor;
}

// Where a skill lands inside its vendor folder: single-skill repos are flat
// (<vendor>/SKILL.md); a category matching the vendor collapses so a repo
// without a marketplace doesn't nest as <vendor>/<vendor>/<skill>. A folder the
// manifest named is a category several sources may share, so its skills always
// sit one level down, each in its own folder.
function skillRelPath(entry, folder, skill) {
  if (entry.folder) return join(folder, skill.slug);
  if (skill.single) return folder;
  const categoryDir = slugify(skill.category);
  if (categoryDir === folder) return join(folder, skill.slug);
  return join(folder, categoryDir, skill.slug);
}

export function readLock() {
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
  const current = new Set(sources.map(vendorFolder));
  for (const locked of prevLock) {
    if (!locked.folder) continue;
    if (!current.has(locked.folder)) {
      rmSync(join(SKILLS_OUTPUT, locked.folder), { recursive: true, force: true });
      console.log(`  - removed skills/${locked.folder} (${locked.source} no longer in the manifest)`);
      continue;
    }
    // The folder is still another source's, so only this source's skills go.
    if (sources.some((e) => e.source === locked.source)) continue;
    removeLockedSkills(locked);
    console.log(`  - removed ${locked.source}'s skills from skills/${locked.folder} (no longer in the manifest)`);
  }
}

// A folder only this source owns is replaced whole; one it shares with another
// source keeps its siblings, so only what this source vendored last time goes.
function clearVendored(entry, folder, prevLock, allSources) {
  const shared = allSources.some((other) => other.source !== entry.source && vendorFolder(other) === folder);
  if (!shared) {
    rmSync(join(SKILLS_OUTPUT, folder), { recursive: true, force: true });
    return;
  }
  const locked = prevLock.find((l) => l.source === entry.source && l.folder === folder);
  if (locked) removeLockedSkills(locked);
}

function removeLockedSkills(locked) {
  for (const slug of locked.skills ?? []) {
    rmSync(join(SKILLS_OUTPUT, locked.folder, slug), { recursive: true, force: true });
  }
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

  const tgz = join(extractDir, TGZ_NAME);
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/${sha}`;
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    console.warn(`Download failed (${res.status}) for ${url}`);
    return null;
  }
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  try {
    // Relative name, resolved from cwd: GNU tar reads an absolute `C:\...`
    // after -f as host:path and refuses it.
    execFileSync("tar", ["-xzf", TGZ_NAME], { cwd: extractDir, stdio: "pipe" });
  } catch {
    // Windows tar cannot create the archive's symlinks without a privilege, but
    // every regular file extracts — rebuild the links as junctions and go on.
    if (process.platform !== "win32" || !rebuildLinks(extractDir)) {
      console.warn(`tar failed for ${entry.source}`);
      return null;
    }
  }

  const inner = readdirSync(extractDir, { withFileTypes: true }).find((e) => e.isDirectory());
  if (!inner) {
    console.warn(`Empty archive for ${entry.source}`);
    return null;
  }
  let root = join(extractDir, inner.name);
  const sub = entry.subpath ?? subpath;
  if (sub) root = join(root, sub);
  return { root, sha, cleanup: extractDir };
}

// Windows tar extracts every regular file and fails only on symlinks. The
// listing still names them all, so rebuild each inside the tree: junctions for
// folders (no privilege needed), copies for files.
function rebuildLinks(extractDir) {
  let listing;
  try {
    listing = execFileSync("tar", ["-tvzf", TGZ_NAME], { cwd: extractDir, stdio: "pipe" }).toString();
  } catch {
    return false;
  }
  const root = readdirSync(extractDir, { withFileTypes: true }).find((e) => e.isDirectory());
  if (!root) return false;
  for (const line of listing.split(/\r?\n/)) {
    if (!line.startsWith("l")) continue;
    const arrow = line.indexOf(" -> ");
    if (arrow < 0) continue;
    const name = line.slice(0, arrow).trimEnd().split(" ").pop();
    if (!name) continue;
    const linkPath = join(extractDir, name);
    let target = resolve(dirname(linkPath), line.slice(arrow + 4));
    if (!existsSync(target)) {
      // The walk's rule: a plugin entry named X aliases the real skills/X, so a
      // link pointing at its author's own disk resolves there too.
      const conventional = join(extractDir, root.name, "skills", basename(name));
      if (!existsSync(join(conventional, "SKILL.md"))) continue;
      target = conventional;
    }
    try {
      if (statSync(target).isDirectory()) symlinkSync(target, linkPath, "junction");
      else copyFileSync(target, linkPath);
    } catch {
      // tar already materialized it, or it cannot be rebuilt — the walk falls back.
    }
  }
  return true;
}

function resolveLocalSource(entry) {
  let root = entry.source.replace(/^~(?=$|\/)/, homedir());
  if (entry.subpath) root = join(root, entry.subpath);
  if (!existsSync(root)) {
    console.warn(`Local source not found: ${root}`);
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
    if (!bySlug.has(skill.slug)) console.log(`  · ${skill.slug} — in repo but not in any plugin, skipped`);
  }
  return [...bySlug.values()];
}

// The fallback category (no marketplace) mirrors the vendor folder, so
// skillRelPath collapses it and the skills sit right under the vendor.
function repoCategory(entry) {
  return prettifyCategory(vendorFolder(entry));
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

export function prettifyCategory(name) {
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

export function slugify(value) {
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

export async function resolveSha(owner, repo, ref) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${ref}`;
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    console.warn(`GitHub API ${res.status} resolving ${owner}/${repo}@${ref}`);
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

export function githubHeaders() {
  const headers = { "User-Agent": "testeiya-vendor-skills", Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
