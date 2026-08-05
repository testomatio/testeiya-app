// Slash-command extension for Testeiya.
//
// All in-session commands register through the SDK's
// `pi.registerCommand(name, { description, handler })` surface. Handlers get an
// ExtensionCommandContext with proper UI primitives (ctx.ui.select / notify /
// input / confirm), so we never have to inspect raw input shapes or fight the
// TUI by writing to stdout.
//
// Add new commands by writing a `register<Name>Command(pi)` function below and
// calling it from `createCommandsExtension()`.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionFactory } from "@oh-my-pi/pi-coding-agent";

import {
  fetchProjects,
  loadStoredAuth,
  saveStoredAuth,
  normalizeBaseUrl,
  UnauthorizedError,
  type Project,
  type StoredAuth,
} from "./testomatio-auth.js";
import { buildTestomatioMcpServers } from "./api/agent-start.js";
import { testomatioTms, testomatioConnection } from "./prompt/testomatio.js";
import { PROJECT_DIR } from "./project-dir.js";
import { readJson } from "./json-store.js";

export function createCommandsExtension(runtime: CommandsRuntime): ExtensionFactory {
  return ((pi: any) => {
    registerConnectCommand(pi, runtime);
    registerProjectCommand(pi, runtime);
    // A connection made mid-session postdates the base system prompt, which was
    // built without Testomat.io context — layer it onto every following turn.
    pi.on("before_agent_start", (event: any) => {
      if (!runtime.connection) return;
      const { projectId, backendUrl } = runtime.connection;
      return {
        systemPrompt: [
          ...event.systemPrompt,
          testomatioTms,
          testomatioConnection([projectId], backendUrl),
        ],
      };
    });
  }) as ExtensionFactory;
}

function registerConnectCommand(pi: any, runtime: CommandsRuntime): void {
  pi.registerCommand("connect", {
    description: "Connect a Testomat.io project and load its MCP tools",
    async handler(_args: string, ctx: any): Promise<void> {
      let stored = loadStoredAuth();
      if (!stored) {
        const baseUrl = normalizeBaseUrl();
        const token = await promptForToken(ctx, baseUrl);
        if (!token) return;
        stored = { token, baseUrl };
        saveStoredAuth(stored);
      }

      const auth = await fetchProjectsWithReauth(stored, ctx);
      if (!auth) return;
      if (auth.projects.length === 0) {
        ctx.ui.notify("No Testomat.io projects available for this account.", "warning");
        return;
      }

      const chosen = await selectProject(auth.projects, "Select a Testomat.io project", ctx);
      if (!chosen) return;

      await applyProject(chosen, auth.stored, runtime, ctx);
    },
  });
}

function registerProjectCommand(pi: any, runtime: CommandsRuntime): void {
  pi.registerCommand("project", {
    description: "Switch the active Testomat.io project",
    async handler(_args: string, ctx: any): Promise<void> {
      const stored = loadStoredAuth();
      if (!stored?.token) {
        ctx.ui.notify("No stored Testomat.io credentials. Run /connect first.", "error");
        return;
      }

      const auth = await fetchProjectsWithReauth(stored, ctx);
      if (!auth) return;
      if (auth.projects.length === 0) {
        ctx.ui.notify("No Testomat.io projects available for this account.", "warning");
        return;
      }

      const chosen = await selectProject(auth.projects, "Switch Testomat.io project", ctx);
      if (!chosen) return;

      const activeId = runtime.connection?.projectId ?? process.env.TESTOMATIO_PROJECT_ID;
      if (chosen.id === activeId) {
        ctx.ui.notify(`Already on ${chosen.title} (${chosen.id}).`, "info");
        return;
      }

      await applyProject(chosen, auth.stored, runtime, ctx);
    },
  });
}

async function promptForToken(ctx: any, baseUrl: string): Promise<string | null> {
  ctx.ui.notify(
    `Open ${baseUrl}/users/sign_in?auth=jwt — sign in, click Authorize, copy the token.`,
    "info",
  );
  const answer = await ctx.ui.input("Paste the Testomat.io token", "eyJ…");
  const token = answer?.trim();
  if (!token) return null;
  if (!token.startsWith("eyJ")) {
    ctx.ui.notify("That doesn't look like a token (expected to start with 'eyJ').", "error");
    return null;
  }
  return token;
}

async function fetchProjectsWithReauth(
  stored: StoredAuth,
  ctx: any,
): Promise<{ stored: StoredAuth; projects: Project[] } | null> {
  let current = stored;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const projects = await fetchProjects(current.token, current.baseUrl);
      return { stored: current, projects };
    } catch (err) {
      if (!(err instanceof UnauthorizedError) || attempt > 0) {
        ctx.ui.notify(
          `Failed to fetch projects: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
        return null;
      }
      ctx.ui.notify("Stored Testomat.io token was rejected — re-authorize.", "warning");
      const token = await promptForToken(ctx, current.baseUrl);
      if (!token) return null;
      current = { ...current, token };
      saveStoredAuth(current);
    }
  }
  return null;
}

async function selectProject(
  projects: Project[],
  title: string,
  ctx: any,
): Promise<Project | null> {
  if (projects.length === 1) return projects[0]!;
  const labels = projects.map(formatProjectLabel);
  const picked = await ctx.ui.select(title, labels);
  if (!picked) return null;
  const idx = labels.indexOf(picked);
  if (idx < 0) return null;
  return projects[idx]!;
}

async function applyProject(
  project: Project,
  stored: StoredAuth,
  runtime: CommandsRuntime,
  ctx: any,
): Promise<void> {
  saveStoredAuth({ ...stored, projectId: project.id });
  process.env.TESTOMATIO = project.apiKey;
  process.env.TESTOMATIO_URL = stored.baseUrl;
  process.env.TESTOMATIO_PROJECT_ID = project.id;
  runtime.connection = { projectId: project.id, backendUrl: stored.baseUrl };

  const servers = await buildTestomatioMcpServers(
    [{ slug: project.id, token: project.apiKey }],
    stored.baseUrl,
  );
  writeMcpConfig(runtime.cwd, servers);

  const mcp = runtime.mcpManager;
  if (!mcp) {
    ctx.ui.notify(
      `Connected to ${project.title} (${project.id}). Restart testeiya to load MCP.`,
      "info",
    );
    return;
  }

  ctx.ui.notify(`Connecting Testomat.io MCP for ${project.title}…`, "info");
  for (const name of mcp.getAllServerNames?.() ?? []) {
    if (!name.startsWith("testomatio-")) continue;
    if (servers[name]) continue;
    await mcp.disconnectServer(name);
  }
  const result = await mcp.discoverAndConnect();
  const failed = Object.keys(servers).find((name) => result?.errors?.get?.(name));
  if (failed) {
    ctx.ui.notify(
      `Testomat.io MCP failed to connect: ${result.errors.get(failed)}`,
      "error",
    );
    return;
  }
  ctx.ui.notify(
    `Connected to ${project.title} (${project.id}) · ${countTestomatioTools(mcp)} MCP tools loaded.`,
    "info",
  );
}

function writeMcpConfig(cwd: string, servers: Record<string, unknown>): void {
  const dir = join(cwd, PROJECT_DIR);
  mkdirSync(dir, { recursive: true });
  for (const file of ["mcp.json", "mcp.all.json"]) {
    const filePath = join(dir, file);
    const existing = readJson<{ mcpServers?: Record<string, unknown> }>(filePath, {});
    const mcpServers: Record<string, unknown> = {};
    for (const [name, config] of Object.entries(existing.mcpServers ?? {})) {
      if (name.startsWith("testomatio-")) continue;
      mcpServers[name] = config;
    }
    Object.assign(mcpServers, servers);
    writeFileSync(filePath, JSON.stringify({ mcpServers }, null, 2), "utf8");
  }
}

function countTestomatioTools(mcp: any): number {
  const tools = mcp.getTools?.() ?? [];
  return tools.filter((t: any) => /^testomatio-/.test(t?.mcpServerName ?? t?.name ?? "")).length;
}

function formatProjectLabel(p: Project): string {
  const fw = p.framework ? `  ·  ${p.framework}` : "";
  return `${p.title}  (${p.id})${fw}`;
}

export interface CommandsRuntime {
  cwd: string;
  mcpManager?: any;
  connection?: { projectId: string; backendUrl: string };
}
