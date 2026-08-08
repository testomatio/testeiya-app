import { getSystemPrompt } from "./system-prompt.js";
import {
  testomatioTms,
  testomatioConnection,
  testomatioNotConnected,
  projectSettings,
  type TmsAccess,
} from "./testomatio.js";
import { appUiGuidance } from "./app-ui.js";
import { browserControl } from "./browser.js";
import { nonInteractive, reportOutput } from "./print.js";
import {
  contextPromptSection,
  type ContextEntry,
  type ContextFolder,
} from "./context.js";
import type { TestomatioProjectInfo } from "./project-info.js";

export function buildSystemPrompt(options?: SystemPromptOptions): string {
  const mode = options?.mode ?? "tui";
  const interactive = mode !== "print";

  // The base prompt (role, workspace, tools, goals) comes first — it defines who
  // the agent is. Specialized rules layer on after it, dynamic context goes last.
  // `ask` is the SDK's built-in question tool, created only when `hasUI` is set
  // (TUI only); web mode has its own `ask_question`, documented in appUiGuidance.
  const parts: string[] = [
    getSystemPrompt(options?.cwd, { interactive, hasAsk: mode === "tui" }),
  ];

  const tokenSlugs = options?.tokens ? Object.keys(options.tokens) : [];
  // The TUI passes no `connection`, so it keeps the managed-tokens gating.
  const tokenAvailable = options?.connection?.tokenAvailable ?? tokenSlugs.length > 0;
  const tms = options?.tms ?? "mcp-direct";
  // Gated on the same condition as the connection section below: both describe
  // the same connection, and the rules are just as needed when the token comes
  // from the environment rather than from a per-project session token.
  if (tokenAvailable || tokenSlugs.length > 0) parts.push(testomatioTms(tms));
  if (mode === "web") parts.push(appUiGuidance);
  if (mode === "print") parts.push(nonInteractive);
  // No browser in a one-shot run: the guidance is written around a window the
  // user can see and take over, and a browser step there is a hang waiting to
  // happen. `nonInteractive` tells the agent to report the gap instead.
  if (options?.browser && interactive) parts.push(browserControl);

  if (options?.promptContext) {
    parts.push(`## Project Test Context\n\n${options.promptContext}`);
  }
  if (options?.contextEntries?.length || options?.contextFolders?.length) {
    parts.push(
      contextPromptSection(options.contextEntries ?? [], options.contextFolders ?? [])
    );
  }
  if (options?.projectInfo) {
    parts.push(projectSettings(options.projectInfo));
  }
  if (tokenAvailable || tokenSlugs.length > 0) {
    parts.push(testomatioConnection(tokenSlugs, options?.backendUrl, options?.connection, tms));
  } else if (mode === "web" || mode === "print") {
    parts.push(testomatioNotConnected());
  }

  // The report contract goes last so it is the final instruction the model reads.
  if (options?.outputFile) parts.push(reportOutput(options.outputFile));

  return parts.join("\n\n");
}

export interface SystemPromptOptions {
  cwd?: string;
  promptContext?: string;
  backendUrl?: string;
  tokens?: Record<string, string>;
  connection?: { tokenAvailable?: boolean; projectId?: string; title?: string };
  mode?: "tui" | "web" | "print";
  /** How the agent reaches Testomat.io; defaults to `mcp-direct`. */
  tms?: TmsAccess;
  browser?: boolean;
  /** Absolute path the agent must write its final report to (`--output`). */
  outputFile?: string;
  projectInfo?: TestomatioProjectInfo | null;
  /** User-added context (linked folders, cloned repos, uploaded docs). */
  contextEntries?: ContextEntry[];
  /** Non-empty predefined `.testeiya` context folders (manual-tests, code, …). */
  contextFolders?: ContextFolder[];
}
