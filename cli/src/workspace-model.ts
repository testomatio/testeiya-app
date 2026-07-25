// The Workspace ↔ Project model.
//
// A *workspace* is a directory on disk; a *project* is a Testomat.io project a
// workspace represents. This module classifies a workspace by scanning its
// files once and bucketing them, then locates its manual tests so the file
// tree, the sync endpoint, and the initial pull all agree on one rule.
//
// A workspace has a `WorkspaceType` (manual | automated | mixed | code | files)
// and a list of `types` — the tree "views" it can be filtered by. A view maps a
// type to a directory (`""` = workspace root, else `.testeiya/<sub>`), so a code
// repo that also carries `.testeiya/manual-tests` and `.testeiya/code` offers
// [automated][manual][code][files] toggles.
//
// Manual-tests location (used by sync/search) still follows:
//   - `.testeiya/manual-tests/` (gitignored cache) wins when present & non-empty;
//   - otherwise the workspace ROOT, when ≥90% of its files are `*.test.md`;
//   - otherwise `null` — nothing loaded yet (a pull would create the cache).

import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./json-store.js";
import { loadGitignore, type GitignoreChain } from "./gitignore.js";
import {
  PROJECT_DIR,
  MANUAL_TESTS_SUBDIR,
  CUSTOM_SKILLS_SUBDIR,
  ensureProjectDirGuards,
  manualTestsCachePath,
  projectMetaPath,
} from "./project-dir.js";

/** Directories never counted in detection nor shown in the tree. */
export const VENDOR_DIRS = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "out",
  "tmp",
  ".git",
  ".next",
]);

export const TEST_MD_RE = /\.test\.md$/i;

/** Filename patterns for automated tests — one line per ecosystem, adjust freely. */
export const AUTOMATED_TEST_RES = [
  /(?:\.|_)(test|spec)\.[cm]?[jt]sx?$/i,
  /\.(cy|e2e)\.[cm]?[jt]sx?$/i,
  /(Test|Tests|Spec|IT)\.(java|kt|kts|scala|groovy)$/,
  /_test\.go$/,
  /(^test_.*|_test)\.py$/i,
  /(^test_.*|_test|_spec)\.rb$/i,
  /(Test|Tests)\.(php|cs)$/,
  /\.feature$/i,
];

/** Root config files that mark a testing-framework project — add frameworks freely. */
export const TEST_CONFIG_RES = [
  /^playwright\.config\.[cm]?[jt]s$/i,
  /^codecept(\.[\w-]+)?\.conf\.[jt]s$/i,
  /^codecept\.json$/i,
  /^cypress\.config\.[cm]?[jt]s$/i,
  /^cypress\.json$/i,
  /^(jest|vitest)\.config\.[cm]?[jt]s$/i,
  /^wdio(\.[\w-]+)?\.conf\.[jt]s$/i,
  /^nightwatch\.conf\.[jt]s$/i,
  /^\.mocharc\.(jsx?|cjs|json|ya?ml)$/i,
  /^\.testcaferc\.(jsx?|json)$/i,
  /^karma\.conf\.js$/i,
  /^protractor\.conf\.js$/i,
  /^phpunit\.xml(\.dist)?$/i,
  /^behat\.yml(\.dist)?$/i,
  /^(pytest\.ini|conftest\.py|tox\.ini)$/i,
  /^\.rspec$/i,
  /^cucumber\.(jsx?|json|ya?ml)$/i,
  /^testng\.xml$/i,
  /^robot\.toml$/i,
];

/** package.json dep names that mark a testing-framework project. */
export const TEST_FRAMEWORK_PKGS = new Set([
  "playwright", "@playwright/test", "codeceptjs", "cypress", "jest", "vitest",
  "mocha", "webdriverio", "@wdio/cli", "nightwatch", "testcafe", "jasmine",
  "cucumber", "@cucumber/cucumber", "karma", "protractor", "ava", "wdio",
]);

/**
 * The subset of test tooling that marks a *test-automation* project (e2e /
 * acceptance runners). Only these force the `automated` type — a unit-test
 * config (rspec, pytest, phpunit, jest, …) legitimately lives inside an
 * application, so it must not override an otherwise-code repo.
 */
export const AUTOMATION_CONFIG_RES = [
  /^playwright\.config\.[cm]?[jt]s$/i,
  /^codecept(\.[\w-]+)?\.conf\.[jt]s$/i,
  /^codecept\.json$/i,
  /^cypress\.config\.[cm]?[jt]s$/i,
  /^cypress\.json$/i,
  /^wdio(\.[\w-]+)?\.conf\.[jt]s$/i,
  /^nightwatch\.conf\.[jt]s$/i,
  /^\.testcaferc\.(jsx?|json)$/i,
  /^protractor\.conf\.js$/i,
  /^behat\.yml(\.dist)?$/i,
  /^cucumber\.(jsx?|json|ya?ml)$/i,
  /^robot\.toml$/i,
];

export const AUTOMATION_FRAMEWORK_PKGS = new Set([
  "playwright", "@playwright/test", "codeceptjs", "cypress", "webdriverio",
  "@wdio/cli", "wdio", "nightwatch", "testcafe", "protractor",
  "cucumber", "@cucumber/cucumber",
]);

/**
 * Root manifests that mark a software project. A real app is mostly templates,
 * styles, config and data (only a minority of files carry a code extension), so
 * a manifest — not a ≥50% code ratio — is what keeps it classified as `code`.
 */
export const CODE_MANIFEST_RES = [
  /^package\.json$/i,
  /^tsconfig(\.[\w-]+)?\.json$/i,
  /^deno\.jsonc?$/i,
  /^Gemfile$/,
  /^Rakefile$/,
  /^config\.ru$/,
  /^[\w-]+\.gemspec$/,
  /^go\.mod$/,
  /^Cargo\.toml$/i,
  /^pom\.xml$/i,
  /^build\.(gradle|sbt)(\.kts)?$/i,
  /^composer\.json$/i,
  /^(requirements[\w-]*\.txt|pyproject\.toml|setup\.py|setup\.cfg|Pipfile|manage\.py)$/i,
  /^mix\.exs$/i,
  /^Package\.swift$/i,
  /^[\w.-]+\.(csproj|fsproj|vbproj|sln)$/i,
  /^(Makefile|CMakeLists\.txt)$/i,
  /^pubspec\.yaml$/i,
];

/** Source-code extensions (lowercase, incl. dot). */
export const CODE_EXTS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts",
  ".java", ".kt", ".kts", ".scala", ".groovy",
  ".go", ".py", ".rb", ".php", ".cs",
  ".c", ".h", ".cpp", ".hpp", ".cc", ".rs", ".swift",
  ".vue", ".svelte", ".sql", ".sh",
]);

/** Neutral in classification — manual folders legitimately hold screenshots/videos. */
export const ASSET_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
  ".mp4", ".mov", ".webm", ".avi", ".mkv", ".mp3", ".wav", ".pdf",
]);

const MANUAL_THRESHOLD = 0.9;
const AUTOMATED_THRESHOLD = 0.5;
const CODE_THRESHOLD = 0.5;
const MAX_SCAN_NODES = 5000;
const RESERVED_PROJECT_SUBDIRS = new Set([MANUAL_TESTS_SUBDIR, CUSTOM_SKILLS_SUBDIR]);

/** Classify a directory by scanning its files (dotfiles + vendor dirs excluded). */
export function detectWorkspaceType(dir: string): WorkspaceType {
  return classifyCounts(scanCounts(dir), hasAutomationConfig(dir), hasCodeManifest(dir));
}

/** True when the filename matches any automated-test convention. */
export function isAutomatedTestFile(name: string): boolean {
  return AUTOMATED_TEST_RES.some((re) => re.test(name));
}

/** True when the filename is a testing-framework config (playwright, codecept, …). */
export function isTestConfigFile(name: string): boolean {
  return TEST_CONFIG_RES.some((re) => re.test(name));
}

/** True when the dir's root holds any testing-framework config or dependency. */
export function hasTestConfig(dir: string): boolean {
  return matchesRoot(dir, TEST_CONFIG_RES) || hasFrameworkDep(dir, TEST_FRAMEWORK_PKGS);
}

/** True when the dir's root marks an e2e / acceptance *automation* project. */
export function hasAutomationConfig(dir: string): boolean {
  return matchesRoot(dir, AUTOMATION_CONFIG_RES) || hasFrameworkDep(dir, AUTOMATION_FRAMEWORK_PKGS);
}

/** True when the dir looks like a source project — a manifest (Gemfile, go.mod, …) or a git repo. */
export function hasCodeManifest(dir: string): boolean {
  return matchesRoot(dir, CODE_MANIFEST_RES) || fs.existsSync(path.join(dir, ".git"));
}

/** True when any `*.test.md` under `dir` carries a `type: automated` test block. */
export function hasAutomatedTestMd(dir: string): boolean {
  return findAutomatedTestMd(dir, { nodes: 0 });
}

/** True when ≥90% of the folder's (non-asset) files are `*.test.md`. */
export function detectManualProject(cwd: string): boolean {
  return detectWorkspaceType(cwd) === "manual";
}

/**
 * Locate the manual-tests source dir relative to `cwd`:
 *   `".testeiya/manual-tests"` | `""` (root) | `null` (none loaded yet).
 */
export function resolveManualTestsDir(cwd: string): string | null {
  if (hasMarkdown(manualTestsCachePath(cwd))) {
    return `${PROJECT_DIR}/${MANUAL_TESTS_SUBDIR}`;
  }
  if (detectManualProject(cwd)) return "";
  return null;
}

export function readProjectMeta(cwd: string): ProjectMeta | null {
  const raw = readJson<Partial<ProjectMeta>>(projectMetaPath(cwd), {});
  if (!raw?.projectId || !raw.baseUrl) return null;
  return { projectId: raw.projectId, baseUrl: raw.baseUrl, title: raw.title };
}

export function writeProjectMeta(cwd: string, meta: ProjectMeta): void {
  writeJson(projectMetaPath(cwd), meta);
  ensureProjectDirGuards(cwd);
}

/** Combined view for the file-tree response. */
export function describeWorkspace(cwd: string): WorkspaceInfo {
  const manualTestsDir = resolveManualTestsDir(cwd);
  const counts = scanCounts(cwd);
  const type = classifyCounts(counts, hasAutomationConfig(cwd), hasCodeManifest(cwd));
  return {
    manualTestsDir,
    isProject: manualTestsDir === "",
    project: readProjectMeta(cwd),
    type,
    types: listWorkspaceTypes(cwd, type, counts, manualTestsDir),
  };
}

function scanCounts(dir: string): TypeCounts {
  const acc: TypeCounts = { manual: 0, automated: 0, code: 0, asset: 0, total: 0, nodes: 0 };
  countFiles(dir, "", acc, loadGitignore(dir));
  return acc;
}

function countFiles(dir: string, relDir: string, acc: TypeCounts, ig: GitignoreChain): void {
  if (acc.nodes >= MAX_SCAN_NODES) return;
  for (const entry of readdirSafe(dir)) {
    if (acc.nodes >= MAX_SCAN_NODES) return;
    if (entry.name.startsWith(".")) continue;
    if (VENDOR_DIRS.has(entry.name)) continue;
    const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (ig.ignores(childRel)) continue;
    acc.nodes++;
    if (entry.isDirectory()) {
      countFiles(path.join(dir, entry.name), childRel, acc, ig.descend(childRel));
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (ASSET_EXTS.has(ext)) {
      acc.asset++;
      continue;
    }
    acc.total++;
    if (TEST_MD_RE.test(entry.name)) {
      acc.manual++;
      continue;
    }
    if (isAutomatedTestFile(entry.name)) {
      acc.automated++;
      continue;
    }
    if (CODE_EXTS.has(ext)) acc.code++;
  }
}

/** Turn bucket counts into a type. Rules run in order; the order IS the tie-break. */
function classifyCounts(c: TypeCounts, hasAutomation: boolean, hasManifest: boolean): WorkspaceType {
  if (c.total === 0) return hasAutomation ? "automated" : "files";
  if (c.manual / c.total >= MANUAL_THRESHOLD) return "manual";
  if (c.manual > 0 && (c.automated > 0 || hasAutomation)) return "mixed";
  if (hasAutomation) return "automated";
  if (c.automated / c.total >= AUTOMATED_THRESHOLD) return "automated";
  // Code wins when it is the dominant test-bucket and the repo is either
  // code-dense or carries a source-project marker — a manifest or a `.git` repo
  // (apps are mostly templates, config and data, so their code ratio is low
  // despite clearly being code).
  const codeDominant = c.code > 0 && c.code >= c.automated && c.code >= c.manual;
  if (codeDominant && (c.code / c.total >= CODE_THRESHOLD || hasManifest)) return "code";
  return "files";
}

function listWorkspaceTypes(
  cwd: string,
  rootType: WorkspaceType,
  counts: TypeCounts,
  manualTestsDir: string | null
): WorkspaceTypeEntry[] {
  const byType = new Map<WorkspaceType, WorkspaceTypeEntry>();
  const add = (type: WorkspaceType, dir: string) => {
    if (!byType.has(type)) byType.set(type, { type, dir });
  };
  if (rootType === "mixed") {
    add("automated", "");
    add("manual", "");
  } else {
    add(rootType, "");
  }
  if (manualTestsDir === `${PROJECT_DIR}/${MANUAL_TESTS_SUBDIR}`) {
    add("manual", manualTestsDir);
  }
  // A pull with `--export-automated` folds `type: automated` tests into the same
  // suite files as the manual ones, so the view holds both — "Manual" would be a
  // lie. One tab either way; only its label changes.
  const manual = byType.get("manual");
  if (manual && hasAutomatedTestMd(path.join(cwd, manual.dir))) {
    manual.label = "tests";
  }
  for (const entry of readdirSafe(path.join(cwd, PROJECT_DIR))) {
    if (!entry.isDirectory()) continue;
    if (RESERVED_PROJECT_SUBDIRS.has(entry.name)) continue;
    const subDir = path.join(cwd, PROJECT_DIR, entry.name);
    const subCounts = scanCounts(subDir);
    if (subCounts.total + subCounts.asset === 0) continue;
    add(
      classifyCounts(subCounts, hasAutomationConfig(subDir), hasCodeManifest(subDir)),
      `${PROJECT_DIR}/${entry.name}`
    );
  }
  const hasHiddenFiles = counts.total > counts.manual + counts.automated || counts.asset > 0;
  if ((rootType === "automated" || rootType === "mixed") && hasHiddenFiles) {
    add("files", "");
  }
  // A code repo with a manual-tests overlay splits into Code (source only) and
  // Manual (the tests); a Files tab reunites them so you can browse everything.
  if (rootType === "code" && manualTestsDir === `${PROJECT_DIR}/${MANUAL_TESTS_SUBDIR}`) {
    add("files", "");
  }
  return [...byType.values()];
}

function matchesRoot(dir: string, res: RegExp[]): boolean {
  return readdirSafe(dir).some((entry) => res.some((re) => re.test(entry.name)));
}

function hasFrameworkDep(dir: string, pkgs: Set<string>): boolean {
  const pkg = readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path.join(dir, "package.json"), {});
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.keys(deps).some((name) => pkgs.has(name));
}

function findAutomatedTestMd(dir: string, budget: { nodes: number }): boolean {
  for (const entry of readdirSafe(dir)) {
    if (budget.nodes >= MAX_SCAN_NODES) return false;
    if (VENDOR_DIRS.has(entry.name)) continue;
    budget.nodes++;
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      if (findAutomatedTestMd(path.join(dir, entry.name), budget)) return true;
      continue;
    }
    if (!entry.isFile() || !TEST_MD_RE.test(entry.name)) continue;
    if (hasAutomatedBlock(path.join(dir, entry.name))) return true;
  }
  return false;
}

function hasAutomatedBlock(absFile: string): boolean {
  let content: string;
  try {
    content = fs.readFileSync(absFile, "utf8");
  } catch {
    return false;
  }
  let armed = false;
  for (const line of content.split("\n")) {
    if (/^<!--\s*test\b/.test(line)) {
      armed = true;
      continue;
    }
    if (!armed) continue;
    if (/^-->/.test(line)) {
      armed = false;
      continue;
    }
    if (/^type:\s*automated\s*$/.test(line)) return true;
  }
  return false;
}

function hasMarkdown(dir: string): boolean {
  for (const entry of readdirSafe(dir)) {
    if (entry.isFile() && entry.name.endsWith(".md")) return true;
    if (entry.isDirectory() && hasMarkdown(path.join(dir, entry.name))) return true;
  }
  return false;
}

function readdirSafe(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export type WorkspaceType = "manual" | "automated" | "mixed" | "code" | "files";

export interface ProjectMeta {
  projectId: string;
  baseUrl: string;
  title?: string;
}

export interface WorkspaceTypeEntry {
  type: WorkspaceType;
  dir: string; // "" = workspace root, else ".testeiya/<sub>"
  label?: string; // overrides the type as the tab's caption
}

export interface WorkspaceInfo {
  manualTestsDir: string | null;
  isProject: boolean;
  project: ProjectMeta | null;
  type: WorkspaceType;
  types: WorkspaceTypeEntry[];
}

interface TypeCounts {
  manual: number;
  automated: number;
  code: number;
  asset: number;
  total: number;
  nodes: number;
}
