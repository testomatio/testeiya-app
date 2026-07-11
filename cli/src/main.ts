import chalk from "chalk";

import {
  InteractiveMode,
  initTheme,
  submitInteractiveInput,
  settings,
} from "@oh-my-pi/pi-coding-agent";

import { createTesteiyaSession } from "./session-factory.js";
import { TesteiyaWelcome } from "./welcome.js";
import { applyTesteiyaTheme } from "./theme.js";
import { attachBrandedLoader } from "./loader-style.js";
import { loadDotEnv, testomatioStatusLine } from "./testomatio.js";
import { migrateLegacyHomeDir } from "./project-dir.js";
import { ensureTestomatioAuth } from "./testomatio-auth.js";
import { loadEnvFiles } from "./load-env.js";
import { initTelemetry } from "./telemetry.js";
import { initFileLog, logStartupConfig } from "./file-log.js";

const VERSION = "0.2.0";

export async function main(_args: string[]): Promise<void> {
  // Carry over an existing ~/.testclaw state dir to ~/.testeiya (rename), before
  // anything reads sessions/auth/config or the migrated ~/.testeiya/.env.
  migrateLegacyHomeDir();

  // Open the persistent file log (after the home-dir migration) so the terminal
  // agent's console + crashes are captured on disk like the other surfaces.
  initFileLog("tui");

  // Load .env BEFORE the session starts — the provider API key and the
  // TESTOMATIO token are read from process.env in createTesteiyaSession.
  loadDotEnv();
  // Also pick up ~/.testeiya/.env (gap-fill) so LANGFUSE_* keys resolve, then
  // start OpenTelemetry → Langfuse (no-op unless the keys are present).
  loadEnvFiles();
  initTelemetry();
  logStartupConfig();

  // Terminal dark/light detection is built into pi-tui's ProcessTerminal —
  // read interactive.ui.terminal.appearance / .onAppearanceChange() when needed.

  // Initialize theme early (InteractiveMode needs it at construction time)
  initTheme();

  // Bootstrap Testomat.io user auth + project selection — but only if the
  // legacy env-var path isn't already set up by the user's shell / .env.
  // The .env flow stays the source of truth when present.
  const envHasTestomatio = Boolean(process.env.TESTOMATIO?.trim());
  let sessionTokens: Record<string, string> | undefined;
  let sessionBackendUrl: string | undefined;
  if (envHasTestomatio) {
    console.log(chalk.dim("  ✓ Using TESTOMATIO from environment"));
  } else {
    try {
      const auth = await ensureTestomatioAuth({
        baseUrl: process.env.TESTOMATIO_URL,
      });
      process.env.TESTOMATIO = auth.project.apiKey;
      process.env.TESTOMATIO_URL = auth.baseUrl;
      process.env.TESTOMATIO_PROJECT_ID = auth.project.id;
      sessionTokens = { [auth.project.id]: auth.project.apiKey };
      sessionBackendUrl = auth.baseUrl;
      console.log(chalk.green(`  ✓ Testomat.io: ${auth.project.title} (${auth.project.id})`));
    } catch (err: any) {
      console.error(chalk.red(`Testomat.io auth failed: ${err.message}`));
      process.exit(1);
    }
  }

  let result;
  try {
    result = await createTesteiyaSession({
      mode: "tui",
      tokens: sessionTokens,
      backendUrl: sessionBackendUrl,
      trusted: true,
    });
  } catch (err: any) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }

  const { session, setToolUIContext, mcpManager, model, config } = result;

  // Configure status line: model + context on left; tokens + time on right
  settings.set("statusLine.preset", "custom");
  settings.set("statusLine.leftSegments", ["model", "context_pct"]);
  settings.set("statusLine.rightSegments", ["token_in", "token_out", "time_spent"]);

  console.log(chalk.dim(`  Model: ${model.provider}/${model.id}`));

  const tmtStatus = testomatioStatusLine(mcpManager);
  if (tmtStatus) console.log(chalk.green(`  ✓ ${tmtStatus}`));

  const skills = session.skills || [];
  if (skills.length > 0) {
    console.log(chalk.dim(`  Skills: ${skills.map((s: any) => s.name).join(", ")}`));
  }

  // Run InteractiveMode (full TUI)
  const interactive = new InteractiveMode(
    session,
    VERSION,
    undefined,
    setToolUIContext,
    undefined,
    mcpManager,
  );

  await interactive.init();

  // Replace default welcome with Testeiya welcome
  const skillNames = (session.skills || []).map((s: any) => s.name);
  const modelName = model.name ?? model.id;
  const providerName = model.provider ?? config.provider.name;
  const testeiyaWelcome = new TesteiyaWelcome(VERSION, modelName, providerName, skillNames);

  const ui = interactive.ui;
  for (let i = 0; i < ui.children.length; i++) {
    const child = ui.children[i];
    if (child && "setModel" in child && "setLspServers" in child) {
      ui.children[i] = testeiyaWelcome;
      break;
    }
  }

  applyTesteiyaTheme(interactive as any);

  // Branded loader: gradient shimmer + rotating QA verbs while the agent thinks.
  attachBrandedLoader(interactive as any);

  ui.requestRender(true);

  // Main input loop — wait for user input and submit to agent.
  // Slash commands are handled by the SDK + the extension we register in
  // session-factory.ts (see src/commands.ts).
  while (true) {
    const input = await interactive.getUserInput();
    await submitInteractiveInput(interactive, session, input);
  }
}
