import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
  type AgentSession,
  type SessionManager,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt } from "../prompt/index.js";
import { pathClis } from "../prompt/tools.js";
import { PACKAGE_ROOT, PI_STATE_DIR, TESTEIYA_HOME } from "./env.js";
import { hasMcp, tmsAccess } from "./mcp.js";
import { applyEnvKeys, resolveModel } from "./model.js";
import { createSetResultTool, type RunResult } from "./result.js";
import { sessionModel } from "./sessions.js";

// From the package root, never this file's own directory: `../skills` would
// resolve to dist/skills, and the filter below would silently drop everything.
export const BUNDLED_SKILLS_DIR = join(PACKAGE_ROOT, "skills");

const MCP_EXTENSION = join(import.meta.dirname, "mcp-extension.js");

/** The one runtime factory, so every command reads the same auth. */
export async function createRuntime(): Promise<ModelRuntime> {
  const runtime = await ModelRuntime.create({
    authPath: join(TESTEIYA_HOME, "auth.json"),
    modelsPath: null,
  });
  await applyEnvKeys(runtime);
  return runtime;
}

/**
 * The loader every command shares, so `doctor` reports the skills a run would
 * actually load. A filter, not a loader: pi also discovers skills from the
 * checkout it is pointed at (`.agents/skills`, `.pi/skills`, and the user's
 * own), and an arbitrary CI clone must not be able to hand the model its own.
 */
export function createLoader(options: LoaderOptions): DefaultResourceLoader {
  return new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: PI_STATE_DIR,
    settingsManager: options.settingsManager,
    additionalSkillPaths: [BUNDLED_SKILLS_DIR],
    additionalExtensionPaths: options.extensionPaths,
    systemPromptOverride: options.systemPrompt,
    skillsOverride: (current) => ({
      skills: current.skills.filter((s) => s.baseDir.startsWith(BUNDLED_SKILLS_DIR)),
      diagnostics: current.diagnostics,
    }),
  });
}

export async function createTesteiyaSession(options: SessionOptions): Promise<CreatedSession> {
  const runtime = await createRuntime();
  const model = resolveModel(runtime, options.model, sessionModel(options.sessionManager));

  const settingsManager = SettingsManager.inMemory();

  const extensionPaths: string[] = [];
  const connectedMcps: string[] = [];
  if (hasMcp()) {
    extensionPaths.push(MCP_EXTENSION);
    connectedMcps.push("Testomat.io");
  }

  const loader = createLoader({
    cwd: options.cwd,
    settingsManager,
    extensionPaths,
    systemPrompt: () =>
      buildSystemPrompt({
        cwd: options.cwd,
        mode: "print",
        tms: tmsAccess(),
        tokens: options.tokens,
        connection: options.connection,
        backendUrl: options.backendUrl,
        outputFile: options.outputFile,
        brief: options.brief,
        connectedClis: pathClis(),
        connectedMcps,
      }),
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir: PI_STATE_DIR,
    model,
    modelRuntime: runtime,
    resourceLoader: loader,
    settingsManager,
    sessionManager: options.sessionManager,
    customTools: [createSetResultTool(options.result)],
    // Extensions start their runtime on this event. Without it the MCP adapter
    // registers its tools but never connects, and every call answers
    // "MCP not initialized".
    sessionStartEvent: { type: "session_start", reason: "startup" },
  });

  // Starts the extension runtime and fires session_start. createAgentSession
  // does not do this — pi's own modes do — and without it an extension is
  // constructed but never initialized: the MCP adapter registers its tools and
  // then answers "MCP not initialized" for every call.
  await session.bindExtensions({
    mode: "print",
    onError: (err) => {
      process.stderr.write(`  extension error (${err.extensionPath}): ${err.error}\n`);
    },
  });

  const skills = loader.getSkills().skills;
  return { session, model: `${model.provider}/${model.id}`, skills };
}

export interface LoaderOptions {
  cwd: string;
  settingsManager: SettingsManager;
  extensionPaths: string[];
  systemPrompt: () => string;
}

export interface SessionOptions {
  cwd: string;
  result: RunResult;
  sessionManager: SessionManager;
  model?: string;
  outputFile?: string;
  brief?: boolean;
  tokens?: Record<string, string>;
  connection?: { tokenAvailable?: boolean };
  backendUrl?: string;
}

export interface CreatedSession {
  session: AgentSession;
  model: string;
  /** What the run can reach — the list a `/name` in the task is matched against. */
  skills: Skill[];
}
