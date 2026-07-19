import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readJson } from "../json-store.js";
import { createSession } from "../session-store.js";
import { PROJECT_DIR, MANUAL_TESTS_SUBDIR, WORKSPACES_DIR } from "../project-dir.js";
import { runCheckTests } from "../check-tests.js";
import { writeProjectMeta } from "../workspace-model.js";
import {
  fetchProjectInfo,
  writeProjectInfo,
  type TestomatioProjectInfo,
} from "../project-info.js";

const require = createRequire(import.meta.url);

function resolveTestomatioMcpBin(pkg: string, binKey: string): string | null {
  const candidates = [
    path.join(process.cwd(), `node_modules/${pkg}/package.json`),
  ];
  try {
    candidates.unshift(require.resolve(`${pkg}/package.json`));
  } catch {}
  for (const pkgPath of candidates) {
    try {
      if (!fs.existsSync(pkgPath)) continue;
      const meta = readJson<{ bin?: string | Record<string, string> }>(pkgPath, {});
      const binRel = typeof meta.bin === "string"
        ? meta.bin
        : meta.bin?.[binKey] ?? Object.values(meta.bin ?? {})[0];
      if (!binRel || typeof binRel !== "string") continue;
      return path.resolve(path.dirname(pkgPath), binRel);
    } catch {
      continue;
    }
  }
  return null;
}

export interface Project {
  title: string;
  slug: string;
  token: string;
}

export interface ProjectResult {
  slug: string;
  title: string;
  status: "ok" | "error";
  fileCount?: number;
  error?: string;
}

export interface ProjectSessionResult {
  sessionId: string;
  cwd: string;
  backendUrl: string;
  projects: ProjectResult[];
}

export async function agentStart(request: Request): Promise<Response> {
  let body: { projects: Project[] };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projects } = body;

  if (!Array.isArray(projects) || projects.length === 0) {
    return Response.json(
      { error: "At least one project is required" },
      { status: 400 }
    );
  }

  for (const p of projects) {
    if (!p.slug || !p.token) {
      return Response.json(
        { error: `Project missing slug or token: ${JSON.stringify(p)}` },
        { status: 400 }
      );
    }
  }

  const result = await createProjectSession(projects);
  return Response.json(result);
}

export interface CreateProjectSessionOptions {
  backendUrl?: string;
  /**
   * Use this fixed workspace root instead of a fresh temp dir. Enables reusing
   * the same on-disk location for a project across launches (the login flow
   * passes a deterministic per-project dir; see `projectWorkspaceDir`).
   */
  workspaceDir?: string;
  /**
   * When the workspace already holds pulled markdown, skip the blocking pull
   * and refresh it in the background instead — so re-opening a known project is
   * instant rather than waiting on a fresh download.
   */
  reuseIfLoaded?: boolean;
  /**
   * Never block on the test sync: create the session immediately and pull the
   * markdown in the background (even on a first, empty load). The agent works
   * via MCP regardless; the workspace fills in as files land.
   */
  background?: boolean;
  /**
   * Overlay mode (single project only): the workspace is the user's own folder,
   * not a project-only dir — pull tests into the gitignored
   * `.testeiya/manual-tests` cache instead of the workspace root.
   */
  overlay?: boolean;
  /**
   * Mark the created session `trusted` (the user explicitly opened this folder,
   * so the agent may write to it and later project connects keep overlaying
   * here instead of switching to a managed dir). Set when overlaying.
   */
  trusted?: boolean;
}

/** Stable on-disk workspace for a project, reused across launches. */
export function projectWorkspaceDir(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(WORKSPACES_DIR, safe);
}

/** Count existing markdown files in a pulled project dir (recursively). */
function countMarkdown(dir: string): number {
  let n = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) n += countMarkdown(full);
    else if (e.name.endsWith(".md")) n++;
  }
  return n;
}

/** Pull a project's manual tests via check-tests into `<cwd>/<dir>`; returns file count. */
async function pullProjectFiles(
  project: Project,
  cwd: string,
  dir: string,
  backendUrl: string
): Promise<number> {
  fs.mkdirSync(path.join(cwd, dir), { recursive: true });
  const result = await runCheckTests("pull", {
    cwd,
    dir,
    token: project.token,
    baseUrl: backendUrl,
    exportAutomated: true,
  });
  if (!result.ok) throw new Error(result.output || "check-tests pull failed");
  return countMarkdown(path.join(cwd, dir));
}

/**
 * Pull the given projects' manual tests into a workspace, write the per-project
 * Testomat.io MCP config, and register a session. Shared by the external
 * `/api/agent/start` entry point and the in-app Testomat.io login flow
 * (`/api/auth/testomatio/session`).
 */
export async function createProjectSession(
  projects: Project[],
  options: CreateProjectSessionOptions = {}
): Promise<ProjectSessionResult> {
  const tempDir = options.workspaceDir
    ? (fs.mkdirSync(options.workspaceDir, { recursive: true }), options.workspaceDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), "testeiya-"));
  const backendUrl =
    options.backendUrl || process.env.TESTOMATIO_URL || "https://app.testomat.io";

  // A single project owns the whole workspace (manual-tests-only) so its tests
  // land at the root; multi-project bulk imports keep a per-slug subdir each.
  // In overlay mode (a project attached to the user's own folder) tests go to
  // the gitignored `.testeiya/manual-tests` cache instead.
  const single = projects.length === 1;
  const overlayDir = path.join(PROJECT_DIR, MANUAL_TESTS_SUBDIR);

  const results: ProjectResult[] = await Promise.all(
    projects.map(async (project): Promise<ProjectResult> => {
      let dir = project.slug;
      if (single && options.overlay) dir = overlayDir;
      else if (single) dir = ".";
      const pullDir = path.join(tempDir, dir);
      fs.mkdirSync(pullDir, { recursive: true });

      const existing = countMarkdown(pullDir);

      // Non-blocking: open the session immediately and sync in the background.
      // Triggered either by `background` (always, even on an empty first load)
      // or `reuseIfLoaded` when the dir already holds pulled markdown.
      const nonBlocking =
        options.background || (options.reuseIfLoaded && existing > 0);
      if (nonBlocking) {
        console.log(
          `[agent/start] '${project.slug}': opening with ${existing} file(s) at ${pullDir}; syncing in background`
        );
        void pullProjectFiles(project, tempDir, dir, backendUrl)
          .then((n) =>
            console.log(
              `[agent/start] background sync pulled ${n} file(s) for '${project.slug}'`
            )
          )
          .catch((err) =>
            console.error(
              `[agent/start] background sync failed for '${project.slug}': ${
                err instanceof Error ? err.message : String(err)
              }`
            )
          );
        return {
          slug: project.slug,
          title: project.title,
          status: "ok",
          fileCount: existing,
        };
      }

      try {
        const count = await pullProjectFiles(project, tempDir, dir, backendUrl);
        console.log(
          `[agent/start] pulled ${count} files for project '${project.slug}' from ${backendUrl}`
        );

        if (count === 0) {
          return {
            slug: project.slug,
            title: project.title,
            status: "error",
            fileCount: 0,
            error: `No manual test files returned from ${backendUrl}/api/test_data?with_files=true. Check that the project has manual suites and that the API token has write permission.`,
          };
        }

        return {
          slug: project.slug,
          title: project.title,
          status: "ok",
          fileCount: count,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[agent/start] check-tests pull failed for '${project.slug}': ${message}`
        );
        return {
          slug: project.slug,
          title: project.title,
          status: "error",
          error: message,
        };
      }
    })
  );

  const successful = results.filter((r) => r.status === "ok");

  // A single-project workspace represents that project on disk: record the link
  // so a later sync (or re-open as a plain folder) can resolve the project.
  if (single && successful.length > 0) {
    writeProjectMeta(tempDir, {
      projectId: projects[0].slug,
      baseUrl: backendUrl,
      title: projects[0].title,
    });
  }

  let promptContext = "";
  if (successful.length > 0 && single) {
    promptContext =
      "Our current tests are in this workspace as markdown (*.test.md) files. Review them to understand context and purpose. When asked to add, change or remove test cases, edit these files.";
  } else if (successful.length > 0) {
    promptContext = `Our current tests are listed in dirs ${successful
      .map((r) => r.slug)
      .join(", ")} as markdown files. Review them to understand context and purpose. If asked to change, add or remove test cases, you interact with them and apply edits.`;
  }

  const sessionId = randomUUID();

  const tokens: Record<string, string> = {};
  for (const p of projects) {
    tokens[p.slug] = p.token;
  }

  // One `/info` fetch per project serves both the MCP package choice below and
  // the persisted settings cache the system prompt + sidebar read.
  const infos = await Promise.all(
    projects.map((p) => fetchProjectInfo(backendUrl, p.slug, p.token))
  );
  if (single && infos[0]) {
    writeProjectInfo(tempDir, infos[0]);
  }

  const mcpServers = await buildTestomatioMcpServers(projects, backendUrl, infos);
  const projectDir = path.join(tempDir, PROJECT_DIR);
  fs.mkdirSync(projectDir, { recursive: true });
  // `mcp.json` is what the SDK reads (the *enabled* set). `mcp.all.json` is the
  // full catalog used by the MCP settings UI to re-enable a disabled server.
  // This MUST be the same dir the SDK discovers from (see project-dir.ts).
  fs.writeFileSync(
    path.join(projectDir, "mcp.all.json"),
    JSON.stringify({ mcpServers }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(projectDir, "mcp.json"),
    JSON.stringify({ mcpServers }, null, 2),
    "utf8"
  );
  console.log(
    `[agent/start] wrote ${PROJECT_DIR}/mcp.json with ${Object.keys(mcpServers).length} testomatio MCP server(s) to ${tempDir}`
  );

  createSession({
    sessionId,
    cwd: tempDir,
    promptContext,
    backendUrl,
    tokens,
    projects: results,
    trusted: options.trusted,
  });

  return {
    sessionId,
    cwd: tempDir,
    backendUrl,
    projects: results,
  };
}

/**
 * Build the per-project Testomat.io MCP server entries written into a
 * workspace's `.testeiya/mcp.json`. An "enterprise" subscription swaps the
 * base MCP server for the superset package that adds the analytics tools
 * (same args/env, drop-in). Resolved per project so mixed multi-project
 * sessions each get the right one. Shared with the TUI's `/connect` command.
 */
export async function buildTestomatioMcpServers(
  projects: Array<{ slug: string; token: string }>,
  backendUrl: string,
  infos?: Array<TestomatioProjectInfo | null>
): Promise<Record<string, unknown>> {
  const resolved =
    infos ??
    (await Promise.all(
      projects.map((p) => fetchProjectInfo(backendUrl, p.slug, p.token))
    ));
  const mcpServers: Record<string, unknown> = {};
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const enterprise = (resolved[i]?.subscription ?? "").toLowerCase() === "enterprise";
    const pkg = enterprise ? "@testomatio/mcp-enterprise" : "@testomatio/mcp";
    const binKey = enterprise ? "testomatio-mcp-enterprise" : "testomatio-mcp";
    const mcpBin = resolveTestomatioMcpBin(pkg, binKey);
    const baseArgs = ["--token", p.token, "--project", p.slug];
    mcpServers[`testomatio-${p.slug}`] = mcpBin
      ? {
          command: process.execPath,
          args: [mcpBin, ...baseArgs],
          env: { TESTOMATIO_BASE_URL: backendUrl },
        }
      : {
          command: "npx",
          args: ["-y", `${pkg}@latest`, ...baseArgs],
          env: { TESTOMATIO_BASE_URL: backendUrl },
        };
  }
  return mcpServers;
}
