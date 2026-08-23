import { getSystemPrompt } from "./system-prompt.js";
import {
  testomatioTms,
  testomatioConnection,
  testomatioNotConnected,
  projectSettings,
  type TmsAccess,
} from "./testomatio.js";
import { briefAnswer, nonInteractive, reportOutput } from "./print.js";
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
  // Anything only one harness can do — its own question tool, a browser it can
  // open for a watching user — reaches the prompt through `sections`,
  // `toolBullets` and `rules`, never from here.
  const parts: string[] = [
    getSystemPrompt(options?.cwd, {
      interactive,
      toolBullets: options?.toolBullets,
      rules: options?.rules,
      connectedClis: options?.connectedClis,
      supportedMcps: options?.supportedMcps,
    }),
  ];

  const tokenSlugs = options?.tokens ? Object.keys(options.tokens) : [];
  // The TUI passes no `connection`, so it keeps the managed-tokens gating.
  const tokenAvailable = options?.connection?.tokenAvailable ?? tokenSlugs.length > 0;
  const tms = options?.tms ?? "mcp-direct";
  // Gated on the same condition as the connection section below: both describe
  // the same connection, and the rules are just as needed when the token comes
  // from the environment rather than from a per-project session token.
  if (tokenAvailable || tokenSlugs.length > 0) parts.push(testomatioTms(tms));
  if (mode === "print") parts.push(nonInteractive);
  // Whatever this harness alone can offer — its chat-app UI tools, a browser it
  // can open for a watching user. A one-shot CLI contributes none of it, and
  // `nonInteractive` tells the agent to report such a gap rather than try.
  for (const section of options?.sections ?? []) parts.push(section);

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

  // The answer contract goes last so it is the final instruction the model reads.
  if (options?.brief) parts.push(briefAnswer);
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
  /** Whole sections this harness contributes (chat-app UI tools, live browser). */
  sections?: string[];
  /** Extra `<available-tools>` bullets for tools only this harness provides. */
  toolBullets?: string[];
  /** Extra `<rules>` bullets, for rules that only hold in this harness. */
  rules?: string[];
  /** How the agent reaches Testomat.io; defaults to `mcp-direct`. */
  tms?: TmsAccess;
  /** Absolute path the agent must write its final report to (`--output`). */
  outputFile?: string;
  /** Answer a question instead of doing a task and reporting (`testeiya ask`). */
  brief?: boolean;
  projectInfo?: TestomatioProjectInfo | null;
  /** User-added context (linked folders, cloned repos, uploaded docs). */
  contextEntries?: ContextEntry[];
  /** Non-empty predefined `.testeiya` context folders (manual-tests, code, …). */
  contextFolders?: ContextFolder[];
  /** CLI tools the user has connected and signed in (e.g. `gh`, `acli`). */
  connectedClis?: string[];
  /** MCP servers Testeiya supports as connections (the connection catalog). */
  supportedMcps?: string[];
}
