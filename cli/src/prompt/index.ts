import { getSystemPrompt } from "./system-prompt.js";
import {
  testomatioTms,
  testomatioConnection,
  testomatioNotConnected,
  projectSettings,
} from "./testomatio.js";
import { appUiGuidance } from "./app-ui.js";
import { browserControl } from "./browser.js";
import type { TestomatioProjectInfo } from "../project-info.js";

export function buildSystemPrompt(options?: SystemPromptOptions): string {
  // The base prompt (role, workspace, tools, goals) comes first — it defines who
  // the agent is. Specialized rules layer on after it, dynamic context goes last.
  const parts: string[] = [getSystemPrompt(options?.cwd)];

  const tokenSlugs = options?.tokens ? Object.keys(options.tokens) : [];
  // The TUI passes no `connection`, so it keeps the managed-tokens gating.
  const tokenAvailable = options?.connection?.tokenAvailable ?? tokenSlugs.length > 0;
  if (tokenSlugs.length > 0) parts.push(testomatioTms);
  if (options?.mode === "web") parts.push(appUiGuidance);
  if (options?.browser) parts.push(browserControl);

  if (options?.promptContext) {
    parts.push(`## Project Test Context\n\n${options.promptContext}`);
  }
  if (options?.projectInfo) {
    parts.push(projectSettings(options.projectInfo));
  }
  if (tokenAvailable || tokenSlugs.length > 0) {
    parts.push(testomatioConnection(tokenSlugs, options?.backendUrl, options?.connection));
  } else if (options?.mode === "web") {
    parts.push(testomatioNotConnected());
  }

  return parts.join("\n\n");
}

export interface SystemPromptOptions {
  cwd?: string;
  promptContext?: string;
  backendUrl?: string;
  tokens?: Record<string, string>;
  connection?: { tokenAvailable?: boolean; projectId?: string; title?: string };
  mode?: "tui" | "web";
  browser?: boolean;
  projectInfo?: TestomatioProjectInfo | null;
}
