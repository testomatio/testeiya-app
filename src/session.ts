import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt } from "../prompt/index.js";
import { PI_STATE_DIR, TESTEIYA_HOME } from "./env.js";
import { hasMcp, tmsAccess } from "./mcp.js";
import { applyEnvKeys, resolveModel } from "./model.js";
import { createSetResultTool, type RunResult } from "./result.js";

// dist/src/session.js → the package root. `../skills` would resolve to
// dist/skills, and the skills filter below would then silently drop everything.
const BUNDLED_SKILLS_DIR = join(import.meta.dirname, "..", "..", "skills");

const MCP_EXTENSION = join(import.meta.dirname, "mcp-extension.js");

export async function createTesteiyaSession(options: SessionOptions): Promise<CreatedSession> {
  // The adapter reads its metadata cache from this dir, and it takes it from the
  // environment rather than from anything we pass in.
  process.env.PI_CODING_AGENT_DIR = PI_STATE_DIR;

  const runtime = await ModelRuntime.create({
    authPath: join(TESTEIYA_HOME, "auth.json"),
    modelsPath: null,
  });
  await applyEnvKeys(runtime);
  const model = resolveModel(runtime, options.model);

  const settingsManager = SettingsManager.inMemory();

  const extensionPaths: string[] = [];
  if (hasMcp()) extensionPaths.push(MCP_EXTENSION);

  const loader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: PI_STATE_DIR,
    settingsManager,
    additionalSkillPaths: [BUNDLED_SKILLS_DIR],
    additionalExtensionPaths: extensionPaths,
    systemPromptOverride: () =>
      buildSystemPrompt({
        cwd: options.cwd,
        mode: "print",
        tms: tmsAccess(),
        tokens: options.tokens,
        connection: options.connection,
        backendUrl: options.backendUrl,
        outputFile: options.outputFile,
      }),
    // A filter, not a loader: pi also discovers skills from the checkout it is
    // pointed at (`.agents/skills`, `.pi/skills`, and the user's own), and an
    // arbitrary CI clone must not be able to hand the model its own skills.
    skillsOverride: (current) => ({
      skills: current.skills.filter((s) => s.baseDir.startsWith(BUNDLED_SKILLS_DIR)),
      diagnostics: current.diagnostics,
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
    sessionManager: SessionManager.inMemory(options.cwd),
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

  const skills = loader.getSkills().skills.length;
  return { session, model: `${model.provider}/${model.id}`, skills };
}

export interface SessionOptions {
  cwd: string;
  result: RunResult;
  model?: string;
  outputFile?: string;
  tokens?: Record<string, string>;
  connection?: { tokenAvailable?: boolean };
  backendUrl?: string;
}

export interface CreatedSession {
  session: AgentSession;
  model: string;
  skills: number;
}
