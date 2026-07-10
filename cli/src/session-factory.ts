import { join } from "node:path";
import { mkdirSync } from "node:fs";

import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  Settings,
  SessionManager,
} from "@oh-my-pi/pi-coding-agent";
import type { ExtensionFactory } from "@oh-my-pi/pi-coding-agent";
import { hasPlaywrightCli, loadBundledSkills, loadCustomSkills, dedupeSkillsByName } from "./skills.js";
import { SOURCE_PATHS } from "@oh-my-pi/pi-coding-agent/discovery/helpers";
import { DEFAULT_MODEL_PER_PROVIDER } from "@oh-my-pi/pi-ai";
import { PROJECT_DIR, HOME_DIR } from "./project-dir.js";

// Rebrand the SDK's project-level config dir from `.omp` to `.testeiya`.
// The SDK has no supported override for this (PI_CONFIG_DIR only affects the
// user-level config root; `SOURCE_PATHS.native.projectDir` is a static const
// with no env/option hook). This is a deliberate in-process monkey patch:
//   - `SOURCE_PATHS` is a plain object (`as const` is TS-only, not frozen),
//   - the builtin discovery provider holds a *live reference* via
//     `const PATHS = SOURCE_PATHS.native` and reads `.projectDir` at call time,
//   - so mutating it once at module load (before any createAgentSession() runs)
//     redirects MCP/skills/rules/AGENTS discovery to `<cwd>/.testeiya/*`.
// No node_modules edits; survives reinstalls. If an SDK upgrade changes these
// internals, the MCP-connectivity check in our session smoke test is the guard.
if (SOURCE_PATHS.native.projectDir !== PROJECT_DIR) {
  (SOURCE_PATHS.native as { projectDir: string }).projectDir = PROJECT_DIR;
}

// Every discovery provider that loads MCP configs from another tool
// (Cursor, Claude, VSCode, etc.) or from arbitrary project-root files.
// We keep only `builtin` — it reads our per-session `<cwd>/.testeiya/mcp.json`.
const OTHER_MCP_PROVIDERS = [
  "mcp-json",
  "cursor",
  "claude",
  "claude-plugins",
  "codex",
  "gemini",
  "opencode",
  "vscode",
  "windsurf",
];

// The SDK's bash tool runs on the brush shell, where a heredoc inside $(...)
// intermittently fails with a bogus "syntax error near token" — and
// `playwright-cli run-code` snippets have no Node globals. Both failures are
// cryptic and cost the model several retries; intercept them with an
// actionable message instead. Replaces the SDK's default rules (cat/grep/find
// redirects), which we don't want.
const BASH_GUARD_RULES = [
  {
    pattern: "\\$\\((?!\\()[^)\\n]*<<",
    tool: "write",
    message:
      "Heredocs inside $(...) command substitution are unreliable in this shell. " +
      "Write the script to a file with the write tool and run it, or use a " +
      "single-line node -e / node -p. Top-level heredocs (not inside $(...)) work fine.",
  },
  {
    pattern: "playwright-cli\\s+run-code[\\s\\S]*process\\.env",
    tool: "bash",
    message:
      "playwright-cli run-code executes in a browser sandbox — process.env and " +
      "other Node globals are not available there. Read the values in bash first " +
      "and interpolate them into the snippet.",
  },
];

import { loadConfig, type TesteiyaConfig } from "./config.js";
import { buildSystemPrompt } from "./prompt/index.js";
import { createPermissionExtension } from "./permissions.js";
import type { AskChannel } from "./extensions/webui/ask-channel.js";
import type { WidgetCommandChannel } from "./extensions/webui/widget-channel.js";
import { createCommandsExtension } from "./commands.js";
import { createTelemetryExtension, isTelemetryEnabled } from "./telemetry.js";

/** Derive API key env var name from provider name (e.g., "openrouter" -> "OPENROUTER_API_KEY") */
function getApiKeyEnvVar(providerName: string): string {
  return `${providerName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

export interface SessionOptions {
  cwd?: string;
  projectIds?: string[];
  promptContext?: string;
  backendUrl?: string;
  tokens?: Record<string, string>;
  /**
   * Which frontend is driving this session.
   *   - "tui"  → activates Pi's built-in `ask` tool via `hasUI: true`; no
   *             web-UI tools are registered.
   *   - "web"  → loads the `webui` extension (render_list / render_tree /
   *             render_item / ask_question + tool_result UI notices) and
   *             leaves `hasUI` off so the built-in `ask` isn't created.
   * Default: "tui".
   */
  mode?: "tui" | "web";
  /**
   * Resume an existing SDK conversation transcript (by its `SessionManager` id)
   * so new turns append to that file with full prior context. When omitted, a
   * fresh conversation is created.
   */
  resumeConversationId?: string;
  /**
   * The user deliberately opened this workspace (folder picker,
   * `TESTEIYA_WORKSPACE`, or the terminal CLI cwd), so the agent gets full
   * read/write/bash access instead of the default read-only gating.
   */
  trusted?: boolean;
  [key: string]: unknown;
}

export async function createTesteiyaSession(options?: SessionOptions) {
  const config = loadConfig();
  const cwd = options?.cwd ?? process.cwd();
  const agentDir = HOME_DIR;

  mkdirSync(agentDir, { recursive: true });

  const settings = await Settings.init({ cwd, agentDir });
  const existing = new Set((settings.get("disabledProviders") ?? []) as string[]);
  for (const id of OTHER_MCP_PROVIDERS) existing.add(id);
  settings.set("disabledProviders", Array.from(existing));

  // Per-project autonomous memory: the SDK extracts durable signal from this
  // workspace's past session transcripts, consolidates it under
  // `~/.testeiya/memories/state/--<cwd>--/`, and auto-injects a summary into the
  // system prompt of future sessions for the same `cwd`. On by default; the user
  // toggles it in Settings (persisted to config.json). Our sessions are persisted
  // and run at taskDepth 0, so this flag is all that gates activation.
  settings.set("memories.enabled", config.memoryEnabled);

  settings.set("bashInterceptor.enabled", true);
  settings.set("bashInterceptor.patterns", BASH_GUARD_RULES);

  // Resolve the active model via the SDK's ModelRegistry. The provider + model
  // are chosen in the Providers & Models UI and persisted to
  // ~/.testeiya/config.json; for dev/CI we still honor the provider's env var
  // (e.g. OPENROUTER_API_KEY). The registry knows each provider's real
  // transport (anthropic-messages, openai-codex-responses, google-gemini-cli,
  // openai-completions, …) and discovers models live — so we no longer hardcode
  // a single provider/api here.
  const providerName = config.provider.name;
  const apiKeyEnvVar = getApiKeyEnvVar(providerName);

  const authStorage = await AuthStorage.create(join(agentDir, "auth.json"));
  // `create()` doesn't load persisted credentials into memory — reload so a
  // signed-in subscription / saved API key is actually visible (otherwise only
  // env-var keys resolve).
  await authStorage.reload();
  const envKey = process.env[apiKeyEnvVar];
  if (envKey) {
    authStorage.setRuntimeApiKey(providerName, envKey);
  }

  const modelRegistry = new ModelRegistry(authStorage);

  // Resolution: (1) bundled lookup, (2) after live discovery, (3) the provider's
  // SDK default model, (4) legacy custom OpenAI-compatible provider via baseUrl.
  let model =
    modelRegistry.find(providerName, config.provider.model) ?? undefined;
  if (!model) {
    try {
      await modelRegistry.refreshProvider(providerName, "online-if-uncached");
    } catch {
      // Discovery is best-effort; fall through to the remaining strategies.
    }
    model =
      modelRegistry.find(providerName, config.provider.model) ?? undefined;
  }
  if (!model) {
    const fallbackId = (
      DEFAULT_MODEL_PER_PROVIDER as Record<string, string>
    )[providerName];
    if (fallbackId) {
      model = modelRegistry.find(providerName, fallbackId) ?? undefined;
    }
  }
  const isKnownProvider =
    providerName in (DEFAULT_MODEL_PER_PROVIDER as Record<string, unknown>);
  if (!model && config.provider.baseUrl && !isKnownProvider) {
    // Back-compat: a custom OpenAI-compatible provider defined purely via
    // config.baseUrl (not one the SDK ships). Guarded to known providers so a
    // stale baseUrl can't mis-register e.g. openai-codex as openai-completions.
    const apiKey = await authStorage.getApiKey(providerName);
    if (apiKey) {
      modelRegistry.registerProvider(providerName, {
        baseUrl: config.provider.baseUrl,
        api: "openai-completions",
        apiKey,
        models: [
          {
            id: config.provider.model,
            name: config.provider.model,
            reasoning: false,
            input: ["text"] as ("text" | "image")[],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: config.provider.contextWindow,
            maxTokens: config.provider.maxTokens,
          },
        ],
      });
      model =
        modelRegistry.find(providerName, config.provider.model) ?? undefined;
    }
  }
  if (!model) {
    throw new Error(
      `Could not resolve model "${config.provider.model}" for provider ` +
      `"${providerName}". Pick a model in the Providers & Models dialog.`
    );
  }

  // Pre-flight credential check so we surface a clean "add a key / sign in"
  // message instead of failing on the first prompt. Keyless providers (ollama,
  // lm-studio, …) return the SDK's no-auth sentinel, so they pass.
  const credential = await modelRegistry.getApiKeyForProvider(providerName);
  if (!credential) {
    throw new Error(
      `Missing API key for "${providerName}". Open the Providers & Models ` +
      `dialog and add your ${providerName} API key or sign in, or set the ` +
      `${apiKeyEnvVar} environment variable.`
    );
  }

  // Gate the browser-automation guidance on whether the @playwright/cli tool is
  // actually installed (the playwright-cli skill itself is vendored from GitHub).
  const systemPrompt = buildSystemPrompt({
    cwd,
    promptContext: options?.promptContext,
    tokens: options?.tokens,
    backendUrl: options?.backendUrl,
    mode: options?.mode,
    browser: hasPlaywrightCli(),
  });

  // Load skills: the prebuilt skills vendored from GitHub into cli/skills
  // (Testomat.io, CodeceptJS, Playwright) + the user's custom skills (global
  // ~/.testeiya/skills and this workspace's .testeiya/skills). Deduped by name
  // so a custom skill can override a bundled one and the SDK never receives two
  // skills of one name.
  const skills = dedupeSkillsByName([
    ...loadBundledSkills(),
    ...loadCustomSkills(cwd),
  ]);

  const mode = options?.mode ?? "tui";

  const extensions: ExtensionFactory[] = [
    createPermissionExtension(config, cwd, options?.trusted) as ExtensionFactory,
    createCommandsExtension(),
  ];
  let askChannel: AskChannel | undefined;
  let widgetChannel: WidgetCommandChannel | undefined;
  if (mode === "web") {
    const { createWebUIExtension, AskChannel, WidgetCommandChannel } = await import(
      "./extensions/webui/index.js"
    );
    askChannel = new AskChannel();
    widgetChannel = new WidgetCommandChannel();
    extensions.push(createWebUIExtension(askChannel, widgetChannel));
  }

  if (isTelemetryEnabled()) {
    extensions.push(
      createTelemetryExtension({
        cwd,
        mode,
        modelId: model.id,
        provider: model.provider,
        projectIds: options?.projectIds,
      }),
    );
  }

  // Own the SessionManager so we control the conversation id (returned to the
  // UI) and can resume a chosen transcript. Same default dir the SDK would pick.
  const sessionDir = SessionManager.getDefaultSessionDir(cwd, agentDir);
  const sessionManager = await resolveSessionManager(
    cwd,
    sessionDir,
    options?.resumeConversationId,
  );

  // Create session
  const result = await createAgentSession({
    cwd,
    agentDir,
    settings,
    model,
    sessionManager,
    // Cast to the SDK's ThinkingLevel: its non-"off" members are nominal
    // `const enum Effort` values, but the runtime strings are identical to our
    // config union, so this is safe (and self-maintaining via Parameters<>).
    thinkingLevel: config.thinkingLevel as NonNullable<
      Parameters<typeof createAgentSession>[0]
    >["thinkingLevel"],
    authStorage,
    modelRegistry,
    systemPrompt,
    skills,
    extensions,
    hasUI: mode === "tui",
    disableExtensionDiscovery: true,
    enableMCP: true,
    enableLsp: false,
    // Intentionally no `toolNames` filter — pi-coding-agent treats it as a
    // whitelist and would hide all discovered MCP tools. We rely on MCP server
    // configs in `<cwd>/.testeiya/mcp.json` and the permission extension to gate
    // dangerous calls instead.
  });

  return {
    ...result,
    model,
    config,
    agentDir,
    params: options,
    askChannel,
    widgetChannel,
    conversationId: sessionManager.getSessionId(),
  };
}

async function resolveSessionManager(
  cwd: string,
  sessionDir: string,
  resumeConversationId?: string,
): Promise<SessionManager> {
  if (!resumeConversationId) return SessionManager.create(cwd, sessionDir);
  const infos = await SessionManager.list(cwd, sessionDir);
  const match = infos.find((i) => i.id === resumeConversationId);
  if (!match) return SessionManager.create(cwd, sessionDir);
  return SessionManager.open(match.path, sessionDir);
}
